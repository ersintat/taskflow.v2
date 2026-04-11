export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

// PATCH /api/tasks/:id/subtasks/:subtaskId
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; subtaskId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const data: any = {};
  if (typeof body.title === 'string') data.title = body.title.trim();
  if (typeof body.completed === 'boolean') data.completed = body.completed;
  if (typeof body.order === 'number') data.order = body.order;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'No update data' }, { status: 400 });
  }

  const subtask = await prisma.subtask.findUnique({ where: { id: params.subtaskId } });
  if (!subtask || subtask.taskId !== params.id) {
    return NextResponse.json({ error: 'Subtask not found' }, { status: 404 });
  }

  const updated = await prisma.subtask.update({
    where: { id: params.subtaskId },
    data,
  });

  return NextResponse.json(updated);
}

// DELETE /api/tasks/:id/subtasks/:subtaskId
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; subtaskId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const subtask = await prisma.subtask.findUnique({ where: { id: params.subtaskId } });
  if (!subtask || subtask.taskId !== params.id) {
    return NextResponse.json({ error: 'Subtask not found' }, { status: 404 });
  }

  await prisma.subtask.delete({ where: { id: params.subtaskId } });

  return NextResponse.json({ ok: true });
}
