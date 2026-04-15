import { query } from '@anthropic-ai/claude-agent-sdk';
import { prisma } from '@/lib/db';
import { syncTaskCategory } from '@/lib/task-utils';
import { trackTokenUsage } from '@/lib/token-tracking';
import { buildSubAgentPrompt } from './sub-agent-prompt';
import path from 'path';

// ─── Concurrency Control ───
const MAX_CONCURRENT = 3;
let activeWorkers = 0;

// ─── System Log Helper ───
async function logEvent(projectId: string | null, title: string, details?: string, level = 'info') {
  try {
    await prisma.systemLog.create({
      data: { projectId, category: 'sub_agent', title, details, level },
    });
  } catch (e: any) { console.error('[logEvent] sub-agent:', e.message); }
}

/**
 * Entry point. Called from executeEnqueueTask (synchronous — captain waits for result).
 */
export async function triggerSubAgentWorker(queueItemId: string): Promise<void> {
  if (activeWorkers >= MAX_CONCURRENT) {
    console.log(`Sub-agent worker: max concurrency (${MAX_CONCURRENT}) reached, task will wait`);
    return;
  }

  activeWorkers++;
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), 10 * 60 * 1000); // 10 min

  try {
    await runSubAgent(queueItemId);
  } catch (error: any) {
    const msg = error.name === 'AbortError' ? 'Sub-agent timed out (10 min)' : error.message;
    console.error(`Sub-agent failed for ${queueItemId}:`, msg);

    try {
      const item = await prisma.agentQueue.findUnique({ where: { id: queueItemId } });
      if (item) {
        await prisma.agentQueue.update({
          where: { id: queueItemId },
          data: { status: 'FAILED', result: JSON.stringify({ error: msg }), completedAt: new Date() },
        });
        await prisma.task.update({ where: { id: item.taskId }, data: { status: 'blocked' } });
        await syncTaskCategory(item.taskId, 'blocked');
        await logEvent(item.taskId, `Sub-agent failed: ${msg}`, undefined, 'error');
      }
    } catch (recoveryErr: any) {
      console.error(`[CRITICAL] Sub-agent recovery failed for ${queueItemId}:`, recoveryErr.message);
    }
  } finally {
    clearTimeout(timeout);
    activeWorkers--;
    processNextInQueue().catch((e) => console.error('[processNextInQueue]', e.message));
  }
}

async function processNextInQueue(): Promise<void> {
  if (activeWorkers >= MAX_CONCURRENT) return;
  const next = await prisma.agentQueue.findFirst({
    where: { status: 'WAITING' },
    orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
  });
  if (next) triggerSubAgentWorker(next.id).catch((e) => console.error('[triggerNext]', e.message));
}

/**
 * Core sub-agent execution via Claude Agent SDK (subscription).
 */
async function runSubAgent(queueItemId: string): Promise<void> {
  // Load queue item
  const queueItem = await prisma.agentQueue.findUnique({
    where: { id: queueItemId },
    include: {
      task: {
        include: {
          assignments: {
            include: { actor: { include: { capabilities: true } } },
          },
        },
      },
    },
  });

  if (!queueItem || queueItem.status !== 'WAITING') return;

  // TypeScript: queueItem is guaranteed non-null after this point
  const qi = queueItem!;

  const agentAssignment = qi.task.assignments.find((a: any) => a.actor.type === 'AGENT');
  if (!agentAssignment) {
    throw new Error(`No agent assigned to task "${qi.task.title}"`);
  }

  const actor = agentAssignment.actor;
  const projectId = qi.task.projectId;
  const workspacePath = path.join(process.cwd(), 'workspaces', projectId);
  const mcpServerScript = path.join(process.cwd(), 'mcp-server', 'index.ts');
  const dbUrl = process.env.DATABASE_URL || 'file:./dev.db';

  await logEvent(projectId, `Sub-agent "${actor.name}" starting: ${qi.task.title}`);

  // Update queue to RUNNING
  await prisma.agentQueue.update({
    where: { id: queueItemId },
    data: { status: 'RUNNING', claimedBy: actor.id, claimedAt: new Date() },
  });
  await prisma.task.update({ where: { id: qi.taskId }, data: { status: 'in_progress' } });
  await syncTaskCategory(qi.taskId, 'in_progress');

  await prisma.taskActivity.create({
    data: {
      taskId: qi.taskId,
      actorId: actor.id,
      eventType: 'claimed',
      description: `Sub-agent "${actor.name}" started work`,
    },
  });

  // Build prompt
  const systemPrompt = await buildSubAgentPrompt(actor, qi.task, projectId, workspacePath);
  const taskPrompt = `Execute this task now:\n\n**${qi.task.title}**\n\n${qi.task.description || 'No description.'}\n\nUse your tools. When finished, provide a clear summary.`;

  // Run via Agent SDK (subscription — no API key needed)
  console.log(`Sub-agent "${actor.name}" executing "${qi.task.title}" via Agent SDK (sonnet)`);

  let fullContent = '';
  let totalTokens = 0;

  const agentOptions = {
    agent: 'sub-agent',
    agents: {
      'sub-agent': {
        description: `Sub-agent: ${actor.name}`,
        prompt: systemPrompt,
        model: 'sonnet' as string,
        effort: 'high' as const,
        maxTurns: 30,
      },
    },
    cwd: workspacePath,
    mcpServers: {
      'taskflow-tools': {
        command: 'npx',
        args: ['tsx', mcpServerScript],
        env: { DATABASE_URL: dbUrl, PROJECT_ID: projectId },
      },
    },
    allowedTools: ['mcp__taskflow-tools__*', 'Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep'],
    permissionMode: 'acceptEdits' as const,
  };

  // Run agent — with API key fallback on rate limit
  async function executeAgent(useApiKey: boolean): Promise<void> {
    const options: any = { ...agentOptions };
    if (useApiKey) {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set — cannot fallback to API');
      options.env = { ANTHROPIC_API_KEY: apiKey };
      options.agents = {
        'sub-agent': { ...agentOptions.agents['sub-agent'], model: 'opus', effort: 'max' },
      };
      console.log(`[sub-agent] Fallback to API key (Opus) for "${actor.name}"`);
    }

    const agentStream = query({ prompt: taskPrompt, options });

    for await (const event of agentStream) {
      if (event.type === 'assistant') {
        for (const block of event.message.content) {
          if (block.type === 'text') {
            fullContent += block.text;
          }
        }
      } else if (event.type === 'result') {
        if (event.subtype === 'success' && event.result) {
          if (!fullContent) fullContent = event.result;
        } else if (event.subtype !== 'success') {
          const errors = ('errors' in event && event.errors?.length) ? event.errors.join(', ') : 'Unknown error';
          throw new Error(`Agent SDK error: ${errors}`);
        }

        if ('usage' in event && event.usage) {
          const u = event.usage as any;
          totalTokens = (u.input_tokens || 0) + (u.output_tokens || 0);
          await trackTokenUsage({
            projectId,
            actorId: actor.id,
            model: useApiKey ? 'claude-opus-api' : 'claude-sonnet-subscription',
            source: 'sub_agent',
            promptTokens: u.input_tokens || 0,
            completionTokens: u.output_tokens || 0,
            totalTokens,
            taskId: qi.taskId,
          }).catch((e: any) => console.error('[sub-agent-worker]', e.message));
        }
      }
    }
  }

  try {
    await executeAgent(false); // subscription first
  } catch (err: any) {
    const msg = err.message || 'Unknown error';
    const isRateLimit = /rate.limit|overloaded|529|too many|quota|capacity|hit your limit/i.test(msg);

    if (isRateLimit && process.env.ANTHROPIC_API_KEY) {
      // Fallback to API key with Opus
      console.log(`[sub-agent] Subscription rate limit hit for "${actor.name}", falling back to API key`);
      await logEvent(projectId, `Sub-agent "${actor.name}" rate limit — switching to API`, msg.substring(0, 200), 'warning');
      fullContent = ''; // reset
      totalTokens = 0;
      try {
        await executeAgent(true); // API key fallback
      } catch (apiErr: any) {
        await logEvent(projectId, `Sub-agent "${actor.name}" API fallback also failed`, apiErr.message?.substring(0, 300), 'error');
        throw new Error(`Sub-agent "${actor.name}" failed on both subscription and API: ${apiErr.message}`);
      }
    } else {
      const errorType = isRateLimit ? 'Rate limit reached (no API key configured)' : 'Execution failed';
      await logEvent(projectId, `Sub-agent "${actor.name}" ${errorType}`, msg.substring(0, 300), 'error');
      throw new Error(`Sub-agent "${actor.name}" ${errorType}: ${msg}`);
    }
  }

  // Report completion
  const summary = fullContent || 'Task completed (no summary)';
  const stepCount = summary.length > 0 ? 1 : 0;

  await prisma.agentQueue.update({
    where: { id: queueItemId },
    data: {
      status: 'COMPLETED',
      result: JSON.stringify({ summary: summary.substring(0, 5000), tokens: totalTokens }),
      completedAt: new Date(),
    },
  });

  await prisma.task.update({ where: { id: qi.taskId }, data: { status: 'pending_review' } });
  await syncTaskCategory(qi.taskId, 'pending_review');

  await prisma.taskActivity.create({
    data: {
      taskId: qi.taskId,
      actorId: actor.id,
      eventType: 'status_changed',
      description: `Sub-agent "${actor.name}" completed work`,
      metadata: JSON.stringify({ queueItemId, tokens: totalTokens }),
    },
  });

  await logEvent(projectId, `Sub-agent "${actor.name}" completed: ${qi.task.title}`, summary.substring(0, 500), 'action');

  // Notify project owner
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { ownerId: true } });
  if (project?.ownerId) {
    await prisma.notification.create({
      data: {
        userId: project.ownerId,
        title: `${actor.name} completed task`,
        message: `"${qi.task.title}" completed, awaiting review.`,
        type: 'success',
        link: `/projects/${projectId}`,
      },
    }).catch((e: any) => console.error('[sub-agent-worker]', e.message));
  }

  console.log(`Sub-agent "${actor.name}" finished "${qi.task.title}"`);

  // Auto-trigger captain review (fire-and-forget)
  const captainBaseUrl = process.env.NEXTAUTH_URL || process.env.BASE_URL || 'http://localhost:3000';
  const captainSecret = process.env.INTERNAL_SECRET || 'taskflow-internal-2026';
  fetch(`${captainBaseUrl}/api/internal/trigger-captain`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-internal-secret': captainSecret },
    body: JSON.stringify({
      projectId,
      agentActorId: actor.id,
      message: `[AUTO] Sub-agent "${actor.name}" completed task "${qi.task.title}". Review the results and decide: approve or reject.`,
    }),
  }).catch((err) => console.error('[sub-agent] captain trigger failed:', err.message));
}
