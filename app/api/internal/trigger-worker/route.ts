export const dynamic = 'force-dynamic';
export const maxDuration = 600;

import { NextRequest, NextResponse } from 'next/server';
import { triggerSubAgentWorker } from '@/lib/orchestrator/sub-agent-worker';
import { prisma } from '@/lib/db';

// POST /api/internal/trigger-worker — triggers sub-agent worker and waits for completion
// Called by MCP server enqueue_task (synchronous — captain waits for result)
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-internal-secret');
  if (secret !== (process.env.INTERNAL_SECRET || 'taskflow-internal-2026')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { queueItemId, waitForResult } = await req.json();
  if (!queueItemId) {
    return NextResponse.json({ error: 'queueItemId required' }, { status: 400 });
  }

  if (!waitForResult) {
    // Fire-and-forget mode (used by scheduler)
    triggerSubAgentWorker(queueItemId).catch((err) => {
      console.error('Worker trigger error:', err);
    });
    return NextResponse.json({ success: true, message: 'Worker triggered' });
  }

  // Synchronous mode — wait for sub-agent to finish and return result
  try {
    await triggerSubAgentWorker(queueItemId);

    const completed = await prisma.agentQueue.findUnique({
      where: { id: queueItemId },
      select: { status: true, result: true, task: { select: { title: true, status: true } } },
    });

    if (completed?.status === 'COMPLETED') {
      const resultData = completed.result ? JSON.parse(completed.result) : {};
      return NextResponse.json({
        success: true,
        status: 'COMPLETED',
        taskTitle: completed.task.title,
        taskStatus: completed.task.status,
        summary: resultData.summary || 'No summary',
        tokens: resultData.tokens || 0,
      });
    } else {
      const resultData = completed?.result ? JSON.parse(completed.result) : {};
      return NextResponse.json({
        success: false,
        status: completed?.status || 'UNKNOWN',
        taskTitle: completed?.task?.title,
        error: resultData.error || 'Sub-agent failed',
      });
    }
  } catch (err: any) {
    return NextResponse.json({
      success: false,
      status: 'ERROR',
      error: err.message,
    });
  }
}
