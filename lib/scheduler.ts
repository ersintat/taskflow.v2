/**
 * Scheduler Engine — DB-driven cron job processor
 *
 * Polls every 60s for due schedules and executes them.
 * Actions: create_task, enqueue_task, run_agent
 */

import { PrismaClient } from '@prisma/client';
import cron from 'node-cron';
import { syncTaskCategory } from './task-utils';

// Use a separate Prisma instance for the scheduler (runs in server.ts context, not Next.js)
const prisma = new PrismaClient();

const TICK_INTERVAL = 60_000; // 60 seconds
let tickInterval: NodeJS.Timeout | null = null;

// ─── System Log Helper ───
async function logEvent(projectId: string | null, title: string, details?: string, level = 'info') {
  try {
    await prisma.systemLog.create({
      data: { projectId, category: 'scheduler', title, details, level },
    });
  } catch (e: any) { console.error('[logEvent] scheduler:', e.message); }
}

// ─── Cron → Next Run Date ───
export function getNextRunAt(cronExpression: string, timezone: string = 'Europe/Istanbul'): Date | null {
  if (!cron.validate(cronExpression)) return null;

  // Parse cron fields manually to calculate next run
  const now = new Date();
  const parts = cronExpression.split(/\s+/);
  if (parts.length < 5) return null;

  // Simple approach: iterate minute by minute from now for up to 48 hours
  const check = new Date(now.getTime() + 60_000); // start from next minute
  check.setSeconds(0, 0);

  for (let i = 0; i < 2880; i++) { // 48 hours of minutes
    const candidate = new Date(check.getTime() + i * 60_000);
    if (matchesCron(parts, candidate)) {
      return candidate;
    }
  }

  // Fallback: 24 hours from now
  return new Date(now.getTime() + 24 * 60 * 60 * 1000);
}

function matchesCron(parts: string[], date: Date): boolean {
  const minute = date.getMinutes();
  const hour = date.getHours();
  const dayOfMonth = date.getDate();
  const month = date.getMonth() + 1;
  const dayOfWeek = date.getDay(); // 0=Sunday

  return (
    matchField(parts[0], minute, 0, 59) &&
    matchField(parts[1], hour, 0, 23) &&
    matchField(parts[2], dayOfMonth, 1, 31) &&
    matchField(parts[3], month, 1, 12) &&
    matchField(parts[4], dayOfWeek, 0, 7)
  );
}

function matchField(field: string, value: number, min: number, max: number): boolean {
  if (field === '*') return true;

  // Handle */N (step)
  if (field.startsWith('*/')) {
    const step = parseInt(field.slice(2));
    return step > 0 && value % step === 0;
  }

  // Handle comma-separated values
  const values = field.split(',');
  for (const v of values) {
    // Handle range (e.g., 1-5)
    if (v.includes('-')) {
      const [start, end] = v.split('-').map(Number);
      if (value >= start && value <= end) return true;
    } else {
      let num = parseInt(v);
      // Day of week: 7 = Sunday (alias for 0)
      if (max === 7 && num === 7) num = 0;
      if (num === value) return true;
    }
  }

  return false;
}

// ─── Execute Schedule ───
async function executeSchedule(schedule: any): Promise<void> {
  const { id, projectId, action, payload: payloadStr, agentId, name } = schedule;

  let payload: any = {};
  try {
    payload = JSON.parse(payloadStr);
  } catch {
    throw new Error(`Invalid payload JSON for schedule "${name}"`);
  }

  switch (action) {
    case 'create_task': {
      const category = await prisma.taskCategory.findFirst({
        where: { projectId, name: 'Backlog' },
      });

      const task = await prisma.task.create({
        data: {
          projectId,
          categoryId: category?.id || undefined,
          title: payload.title || `[Scheduled] ${name}`,
          description: payload.description || `Auto-created by schedule: ${name}`,
          priority: payload.priority || 'medium',
          taskType: payload.taskType || 'action',
          platform: payload.platform || null,
          status: 'todo',
        },
      });

      await prisma.taskActivity.create({
        data: { taskId: task.id, eventType: 'task_created', description: `Scheduled task created by "${name}"` },
      });

      await logEvent(projectId, `Schedule "${name}" created task: ${task.title}`, `taskId: ${task.id}`, 'action');
      break;
    }

    case 'enqueue_task': {
      const taskId = payload.taskId;
      if (!taskId) throw new Error('enqueue_task action requires payload.taskId');

      const queueItem = await prisma.agentQueue.create({
        data: { taskId, priority: typeof payload.queuePriority === 'number' ? payload.queuePriority : 0, status: 'WAITING' },
      });

      // Trigger worker
      const baseUrl = process.env.NEXTAUTH_URL || process.env.BASE_URL || 'http://localhost:3000';
      const secret = process.env.INTERNAL_SECRET || 'taskflow-internal-2026';
      fetch(`${baseUrl}/api/internal/trigger-worker`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-secret': secret },
        body: JSON.stringify({ queueItemId: queueItem.id }),
      }).catch((err) => console.error('Scheduler: worker trigger failed:', err.message));

      await logEvent(projectId, `Schedule "${name}" enqueued task`, `queueItemId: ${queueItem.id}`, 'action');
      break;
    }

    case 'run_agent': {
      if (!agentId) throw new Error('run_agent action requires agentId');

      // Create task
      const category = await prisma.taskCategory.findFirst({
        where: { projectId, name: 'Backlog' },
      });

      const task = await prisma.task.create({
        data: {
          projectId,
          categoryId: category?.id || undefined,
          title: payload.title || `[Scheduled] ${name}`,
          description: payload.description || `Auto-created by schedule: ${name}`,
          priority: payload.priority || 'medium',
          taskType: payload.taskType || 'action',
          platform: payload.platform || null,
          status: 'todo',
        },
      });

      // Assign to agent
      await prisma.taskAssignment.create({
        data: { taskId: task.id, actorId: agentId, role: 'ASSIGNEE' },
      });

      // Enqueue
      const queueItem = await prisma.agentQueue.create({
        data: { taskId: task.id, priority: typeof payload.queuePriority === 'number' ? payload.queuePriority : 0, status: 'WAITING' },
      });

      // Trigger worker
      const baseUrl = process.env.NEXTAUTH_URL || process.env.BASE_URL || 'http://localhost:3000';
      const secret = process.env.INTERNAL_SECRET || 'taskflow-internal-2026';
      fetch(`${baseUrl}/api/internal/trigger-worker`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-secret': secret },
        body: JSON.stringify({ queueItemId: queueItem.id }),
      }).catch((err) => console.error('Scheduler: worker trigger failed:', err.message));

      await prisma.taskActivity.create({
        data: { taskId: task.id, eventType: 'task_created', description: `Scheduled agent run by "${name}"` },
      });

      await logEvent(projectId, `Schedule "${name}" triggered agent run`, `taskId: ${task.id}, agentId: ${agentId}`, 'action');
      break;
    }

    default:
      throw new Error(`Unknown schedule action: ${action}`);
  }
}

// ─── Tick — runs every 60 seconds ───
async function tick(): Promise<void> {
  try {
    const now = new Date();
    const dueSchedules = await prisma.schedule.findMany({
      where: {
        isActive: true,
        nextRunAt: { lte: now },
      },
    });

    if (dueSchedules.length === 0) return;

    console.log(`[Scheduler] ${dueSchedules.length} schedule(s) due`);

    for (const schedule of dueSchedules) {
      try {
        await executeSchedule(schedule);

        const nextRun = getNextRunAt(schedule.cron, schedule.timezone);
        await prisma.schedule.update({
          where: { id: schedule.id },
          data: {
            lastRunAt: now,
            nextRunAt: nextRun,
            runCount: { increment: 1 },
            lastError: null,
          },
        });

        console.log(`[Scheduler] ✓ "${schedule.name}" executed, next: ${nextRun?.toISOString()}`);
      } catch (err: any) {
        console.error(`[Scheduler] ✗ "${schedule.name}" failed:`, err.message);
        await prisma.schedule.update({
          where: { id: schedule.id },
          data: {
            lastRunAt: now,
            nextRunAt: getNextRunAt(schedule.cron, schedule.timezone),
            lastError: err.message,
          },
        }).catch((e: any) => console.error('[Scheduler] Failed to update schedule after error:', e.message));

        await logEvent(schedule.projectId, `Schedule "${schedule.name}" failed: ${err.message}`, undefined, 'error');
      }
    }
  } catch (err: any) {
    console.error('[Scheduler] Tick error:', err.message);
  }
}

// ─── Init ───
export function initScheduler(): void {
  if (tickInterval) return; // already initialized

  console.log('[Scheduler] Initialized — polling every 60s');

  // Run first tick after 5 seconds (let the server fully start)
  setTimeout(() => {
    tick().catch((e) => console.error('[Scheduler] Initial tick failed:', e.message));
  }, 5000);

  tickInterval = setInterval(() => {
    tick().catch((e) => console.error('[Scheduler] Tick failed:', e.message));
  }, TICK_INTERVAL);
}

export function stopScheduler(): void {
  if (tickInterval) {
    clearInterval(tickInterval);
    tickInterval = null;
    console.log('[Scheduler] Stopped');
  }
}
