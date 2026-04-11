export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { syncTaskCategory } from '@/lib/task-utils';

// POST /api/tasks/:id/decide — record a decision (approve/reject/redirect)
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json();
    const { actorId, decisionType, title, decision, rationale } = body ?? {};

    if (!decisionType || !title || !decision) {
      return NextResponse.json({ error: 'decisionType, title, and decision are required' }, { status: 400 });
    }

    const task = await prisma.task.findUnique({ where: { id: params.id } });
    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

    // Resolve actorId — try to find actor matching session user, or use provided actorId
    let resolvedActorId = actorId;
    if (!resolvedActorId) {
      const userEmail = (session.user as any)?.email;
      if (userEmail) {
        const actor = await prisma.actor.findFirst({ where: { email: userEmail } });
        if (actor) resolvedActorId = actor.id;
      }
    }
    // If still no actor, create a temporary reference using first available human actor
    if (!resolvedActorId) {
      const fallback = await prisma.actor.findFirst({ where: { type: 'HUMAN' } });
      resolvedActorId = fallback?.id;
    }
    if (!resolvedActorId) {
      return NextResponse.json({ error: 'No actor found for decision' }, { status: 400 });
    }

    const dec = await prisma.decision.create({
      data: {
        taskId: params.id,
        actorId: resolvedActorId,
        decisionType,
        title,
        decision,
        rationale: rationale ?? null,
      },
      include: { actor: true },
    });

    // Update task status based on decision
    let newStatus = task.status;
    if (decisionType === 'APPROVAL') {
      newStatus = 'done';
    } else if (decisionType === 'REJECTION') {
      newStatus = 'todo';
    } else if (decisionType === 'REDIRECT') {
      newStatus = 'in_progress';
    }

    if (newStatus !== task.status) {
      await prisma.task.update({ where: { id: params.id }, data: { status: newStatus } });
      await syncTaskCategory(params.id, newStatus);
    }

    // Log activity
    await prisma.taskActivity.create({
      data: {
        taskId: params.id,
        actorId: resolvedActorId,
        eventType: 'decision_made',
        description: `${decisionType}: ${title}`,
        metadata: JSON.stringify({ decisionType, title, decision: decision.substring(0, 200) }),
      },
    });

    return NextResponse.json(dec, { status: 201 });
  } catch (err: any) {
    console.error('POST /api/tasks/[id]/decide error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// GET /api/tasks/:id/decide — list decisions for a task
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const decisions = await prisma.decision.findMany({
      where: { taskId: params.id },
      orderBy: { createdAt: 'desc' },
      include: { actor: { select: { id: true, name: true, type: true } } },
    });

    return NextResponse.json(decisions);
  } catch (err: any) {
    console.error('GET /api/tasks/[id]/decide error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
