export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { syncTaskCategory } from '@/lib/task-utils';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const task = await prisma.task.findUnique({
      where: { id: params.id },
      include: {
        category: true,
        assignments: { include: { actor: true } },
        activities: {
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: { actor: true },
        },
      },
    });
    if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(task);
  } catch (err: any) {
    console.error('GET /api/tasks/[id] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json();
    const existing = await prisma.task.findUnique({ where: { id: params.id } });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const data: any = {};
    if (body.title !== undefined) data.title = body.title;
    if (body.description !== undefined) data.description = body.description;
    if (body.status !== undefined) data.status = body.status;
    if (body.priority !== undefined) data.priority = body.priority;
    if (body.taskType !== undefined) data.taskType = body.taskType;
    if (body.categoryId !== undefined) data.categoryId = body.categoryId || null;
    if (body.dueDate !== undefined) data.dueDate = body.dueDate ? new Date(body.dueDate) : null;
    if (body.riskLevel !== undefined) data.riskLevel = body.riskLevel || null;
    if (body.platform !== undefined) data.platform = body.platform || null;

    const updated = await prisma.task.update({ where: { id: params.id }, data });

    // Auto-move category on status change
    if (body.status !== undefined && body.status !== existing.status) {
      await syncTaskCategory(params.id, body.status);
    }

    // Log activities for important changes
    if (body.status !== undefined && body.status !== existing.status) {
      await prisma.taskActivity.create({
        data: {
          taskId: params.id,
          eventType: 'status_changed',
          description: `Status changed from ${existing.status} to ${body.status}`,
          metadata: JSON.stringify({ from: existing.status, to: body.status }),
        },
      });
    }
    if (body.priority !== undefined && body.priority !== existing.priority) {
      await prisma.taskActivity.create({
        data: {
          taskId: params.id,
          eventType: 'priority_changed',
          description: `Priority changed from ${existing.priority} to ${body.priority}`,
          metadata: JSON.stringify({ from: existing.priority, to: body.priority }),
        },
      });
    }

    return NextResponse.json(updated);
  } catch (err: any) {
    console.error('PATCH /api/tasks/[id] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
