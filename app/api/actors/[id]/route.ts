export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

// GET /api/actors/:id — full agent profile with tasks, activities, stats
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const actor = await prisma.actor.findUnique({
      where: { id: params.id },
      include: {
        capabilities: true,
        assignments: {
          include: {
            task: {
              select: {
                id: true, title: true, status: true, priority: true,
                taskType: true, platform: true, createdAt: true,
                project: { select: { id: true, name: true } },
              },
            },
          },
          orderBy: { assignedAt: 'desc' },
          take: 50,
        },
        activities: {
          include: {
            task: { select: { id: true, title: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 30,
        },
        comments: {
          include: {
            task: { select: { id: true, title: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
        decisions: {
          include: {
            task: { select: { id: true, title: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    });

    if (!actor) return NextResponse.json({ error: 'Actor not found' }, { status: 404 });

    // Compute stats
    const tasks = actor.assignments.map((a: any) => a.task);
    const stats = {
      totalAssigned: tasks.length,
      completed: tasks.filter((t: any) => t.status === 'done').length,
      inProgress: tasks.filter((t: any) => t.status === 'in_progress').length,
      todo: tasks.filter((t: any) => t.status === 'todo').length,
      blocked: tasks.filter((t: any) => t.status === 'blocked').length,
      pendingReview: tasks.filter((t: any) => t.status === 'pending_review').length,
      totalActivities: actor.activities.length,
      totalComments: actor.comments.length,
      totalDecisions: actor.decisions.length,
    };

    return NextResponse.json({ ...actor, stats });
  } catch (err: any) {
    console.error('GET /api/actors/[id] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/actors/:id — update actor fields
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const allowedFields = ['name', 'email', 'trustLevel', 'persona', 'behavior', 'rules', 'isActive'];
    const updateData: any = {};
    for (const key of allowedFields) {
      if (body[key] !== undefined) updateData[key] = body[key];
    }

    const actor = await prisma.actor.update({
      where: { id: params.id },
      data: updateData,
    });

    return NextResponse.json(actor);
  } catch (err: any) {
    console.error('PATCH /api/actors/[id] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/actors/:id — delete actor and all related data
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const actor = await prisma.actor.findUnique({ where: { id: params.id } });
    if (!actor) return NextResponse.json({ error: 'Actor not found' }, { status: 404 });

    // Clean up relations that don't cascade
    await prisma.agentQueue.updateMany({ where: { claimedBy: params.id }, data: { claimedBy: null } });

    await prisma.actor.delete({ where: { id: params.id } });

    return NextResponse.json({ success: true, message: `Actor "${actor.name}" deleted` });
  } catch (err: any) {
    console.error('DELETE /api/actors/[id] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
