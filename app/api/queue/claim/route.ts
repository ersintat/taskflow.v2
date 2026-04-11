export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

// POST /api/queue/claim — agent claims next task from queue
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await request.json();
    const { actorId } = body ?? {};
    if (!actorId) return NextResponse.json({ error: 'actorId is required' }, { status: 400 });

    // Find highest priority WAITING item
    const next = await prisma.agentQueue.findFirst({
      where: { status: 'WAITING' },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });

    if (!next) return NextResponse.json({ message: 'No tasks in queue' }, { status: 204 });

    const claimed = await prisma.agentQueue.update({
      where: { id: next.id },
      data: { status: 'CLAIMED', claimedBy: actorId, claimedAt: new Date() },
      include: { task: true },
    });

    // Log activity
    await prisma.taskActivity.create({
      data: {
        taskId: next.taskId,
        actorId,
        eventType: 'claimed',
        description: 'Task claimed from queue',
      },
    });

    return NextResponse.json(claimed);
  } catch (err: any) {
    console.error('POST /api/queue/claim error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
