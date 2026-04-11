export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

// GET /api/tasks/:id/comments — list threaded comments
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const taskId = params.id;

  // Fetch top-level comments with replies (1 level deep)
  const comments = await prisma.comment.findMany({
    where: { taskId, parentId: null },
    orderBy: { createdAt: 'asc' },
    include: {
      actor: { select: { id: true, name: true, type: true } },
      replies: {
        orderBy: { createdAt: 'asc' },
        include: {
          actor: { select: { id: true, name: true, type: true } },
        },
      },
    },
  });

  return NextResponse.json(comments);
}

// POST /api/tasks/:id/comments — create a comment
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const taskId = params.id;
  const body = await req.json();
  const { content, actorId, parentId } = body;

  if (!content?.trim()) {
    return NextResponse.json({ error: 'Content is required' }, { status: 400 });
  }
  if (!actorId) {
    return NextResponse.json({ error: 'Actor is required' }, { status: 400 });
  }

  // Verify task exists
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

  // If parentId, verify it belongs to this task
  if (parentId) {
    const parent = await prisma.comment.findUnique({ where: { id: parentId } });
    if (!parent || parent.taskId !== taskId) {
      return NextResponse.json({ error: 'Invalid parent comment' }, { status: 400 });
    }
  }

  const comment = await prisma.comment.create({
    data: {
      taskId,
      actorId,
      content: content.trim(),
      parentId: parentId || null,
    },
    include: {
      actor: { select: { id: true, name: true, type: true } },
      replies: {
        include: {
          actor: { select: { id: true, name: true, type: true } },
        },
      },
    },
  });

  return NextResponse.json(comment, { status: 201 });
}
