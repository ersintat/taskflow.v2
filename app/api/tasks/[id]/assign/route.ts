export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json();
    const { actorId, role } = body ?? {};
    if (!actorId) return NextResponse.json({ error: 'actorId required' }, { status: 400 });

    const assignment = await prisma.taskAssignment.upsert({
      where: { taskId_actorId_role: { taskId: params.id, actorId, role: role ?? 'ASSIGNEE' } },
      update: {},
      create: { taskId: params.id, actorId, role: role ?? 'ASSIGNEE' },
    });

    const actor = await prisma.actor.findUnique({ where: { id: actorId } });
    await prisma.taskActivity.create({
      data: {
        taskId: params.id,
        actorId,
        eventType: 'assigned',
        description: `${actor?.name ?? 'Someone'} was assigned`,
      },
    });

    return NextResponse.json(assignment, { status: 201 });
  } catch (err: any) {
    console.error('POST /api/tasks/[id]/assign error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { searchParams } = new URL(req.url);
    const actorId = searchParams.get('actorId');
    if (!actorId) return NextResponse.json({ error: 'actorId required' }, { status: 400 });

    await prisma.taskAssignment.deleteMany({
      where: { taskId: params.id, actorId },
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('DELETE /api/tasks/[id]/assign error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
