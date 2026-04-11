export const dynamic = 'force-dynamic';
export const maxDuration = 600;

import { NextRequest, NextResponse } from 'next/server';
import { triggerSubAgentWorker } from '@/lib/orchestrator/sub-agent-worker';

// POST /api/internal/trigger-worker — triggers sub-agent worker for a queue item
// Called by MCP server after enqueue_task
export async function POST(req: NextRequest) {
  // Internal-only: check for secret header
  const secret = req.headers.get('x-internal-secret');
  if (secret !== (process.env.INTERNAL_SECRET || 'taskflow-internal-2026')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { queueItemId } = await req.json();
  if (!queueItemId) {
    return NextResponse.json({ error: 'queueItemId required' }, { status: 400 });
  }

  // Fire-and-forget: start worker, don't wait for completion
  triggerSubAgentWorker(queueItemId).catch((err) => {
    console.error('Worker trigger error:', err);
  });

  return NextResponse.json({ success: true, message: 'Worker triggered' });
}
