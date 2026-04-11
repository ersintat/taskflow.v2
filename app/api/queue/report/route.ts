export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { syncTaskCategory } from '@/lib/task-utils';

// POST /api/queue/report — agent reports result for a queue item
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await request.json();
    const { queueItemId, status, result } = body ?? {};
    if (!queueItemId) return NextResponse.json({ error: 'queueItemId is required' }, { status: 400 });
    if (!['COMPLETED', 'FAILED'].includes(status)) {
      return NextResponse.json({ error: 'status must be COMPLETED or FAILED' }, { status: 400 });
    }

    const item = await prisma.agentQueue.findUnique({ where: { id: queueItemId } });
    if (!item) return NextResponse.json({ error: 'Queue item not found' }, { status: 404 });

    const updated = await prisma.agentQueue.update({
      where: { id: queueItemId },
      data: {
        status,
        result: result ?? null,
        completedAt: new Date(),
      },
    });

    // If completed, move task to pending_review for human approval
    if (status === 'COMPLETED') {
      await prisma.task.update({
        where: { id: item.taskId },
        data: { status: 'pending_review' },
      });
      await syncTaskCategory(item.taskId, 'pending_review');
      await prisma.taskActivity.create({
        data: {
          taskId: item.taskId,
          actorId: item.claimedBy ?? undefined,
          eventType: 'status_changed',
          description: 'Agent completed work — moved to Pending Review for approval',
          metadata: JSON.stringify({ from: 'in_progress', to: 'pending_review' }),
        },
      });
    }

    if (status === 'FAILED') {
      await prisma.task.update({
        where: { id: item.taskId },
        data: { status: 'blocked' },
      });
      await syncTaskCategory(item.taskId, 'blocked');
      await prisma.taskActivity.create({
        data: {
          taskId: item.taskId,
          actorId: item.claimedBy ?? undefined,
          eventType: 'status_changed',
          description: 'Agent work failed — task blocked',
          metadata: JSON.stringify({ from: 'in_progress', to: 'blocked', reason: result?.error ?? 'Unknown failure' }),
        },
      });
    }

    return NextResponse.json(updated);
  } catch (err: any) {
    console.error('POST /api/queue/report error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
