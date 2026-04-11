export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

// PATCH /api/tasks/:id/comments/:commentId — edit
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; commentId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { content } = await req.json();
  if (!content?.trim()) {
    return NextResponse.json({ error: 'Content is required' }, { status: 400 });
  }

  const comment = await prisma.comment.findUnique({ where: { id: params.commentId } });
  if (!comment || comment.taskId !== params.id) {
    return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
  }

  const updated = await prisma.comment.update({
    where: { id: params.commentId },
    data: { content: content.trim() },
    include: { actor: { select: { id: true, name: true, type: true } } },
  });

  return NextResponse.json(updated);
}

// DELETE /api/tasks/:id/comments/:commentId
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; commentId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const comment = await prisma.comment.findUnique({ where: { id: params.commentId } });
  if (!comment || comment.taskId !== params.id) {
    return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
  }

  await prisma.comment.delete({ where: { id: params.commentId } });

  return NextResponse.json({ ok: true });
}
