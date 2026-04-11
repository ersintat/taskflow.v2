export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

// GET /api/queue — queue stats + items
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const [items, statusCounts, totalBudget, actorLoads] = await Promise.all([
      prisma.agentQueue.findMany({
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: {
          task: { select: { id: true, title: true, priority: true, status: true, platform: true } },
          claimer: { select: { id: true, name: true, type: true } },
        },
      }),
      prisma.agentQueue.groupBy({
        by: ['status'],
        _count: { id: true },
      }),
      prisma.agentQueue.aggregate({
        _sum: { budgetCents: true },
      }),
      prisma.agentQueue.groupBy({
        by: ['claimedBy'],
        where: { claimedBy: { not: null }, status: { in: ['CLAIMED', 'RUNNING'] } },
        _count: { id: true },
      }),
    ]);

    // Build status map
    const stats: Record<string, number> = { WAITING: 0, CLAIMED: 0, RUNNING: 0, COMPLETED: 0, FAILED: 0 };
    statusCounts.forEach((s: any) => { stats[s.status] = s._count.id; });

    // Build actor load list
    const actorIds = actorLoads.map((a: any) => a.claimedBy).filter(Boolean);
    const actors = actorIds.length > 0
      ? await prisma.actor.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true, type: true } })
      : [];
    const actorMap = new Map(actors.map((a: any) => [a.id, a]));
    const loads = actorLoads.map((a: any) => ({
      actor: actorMap.get(a.claimedBy) ?? { id: a.claimedBy, name: 'Unknown', type: 'AGENT' },
      activeCount: a._count.id,
    }));

    return NextResponse.json({
      items,
      stats,
      totalBudgetCents: totalBudget._sum.budgetCents ?? 0,
      actorLoads: loads,
    });
  } catch (err: any) {
    console.error('GET /api/queue error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/queue — enqueue a task
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await request.json();
    const { taskId, priority, budgetCents } = body ?? {};
    if (!taskId) return NextResponse.json({ error: 'taskId is required' }, { status: 400 });

    // Check task exists
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

    const item = await prisma.agentQueue.create({
      data: {
        taskId,
        priority: priority ?? 0,
        budgetCents: budgetCents ?? null,
        status: 'WAITING',
      },
    });

    // Log activity
    await prisma.taskActivity.create({
      data: {
        taskId,
        eventType: 'queued',
        description: `Task queued for agent processing (priority: ${priority ?? 0})`,
      },
    });

    return NextResponse.json(item, { status: 201 });
  } catch (err: any) {
    console.error('POST /api/queue error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
