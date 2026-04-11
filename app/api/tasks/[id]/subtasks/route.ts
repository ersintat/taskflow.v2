export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

// GET /api/tasks/:id/subtasks
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const subtasks = await prisma.subtask.findMany({
    where: { taskId: params.id },
    orderBy: { order: 'asc' },
  });

  return NextResponse.json(subtasks);
}

// POST /api/tasks/:id/subtasks
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { title } = await req.json();
  if (!title?.trim()) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  }

  const task = await prisma.task.findUnique({ where: { id: params.id } });
  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

  // Get max order
  const last = await prisma.subtask.findFirst({
    where: { taskId: params.id },
    orderBy: { order: 'desc' },
    select: { order: true },
  });

  const subtask = await prisma.subtask.create({
    data: {
      taskId: params.id,
      title: title.trim(),
      order: (last?.order ?? -1) + 1,
    },
  });

  return NextResponse.json(subtask, { status: 201 });
}
