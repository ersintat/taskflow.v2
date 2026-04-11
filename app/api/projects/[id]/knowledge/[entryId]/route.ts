export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

// PATCH /api/projects/:id/knowledge/:entryId
export async function PATCH(req: Request, { params }: { params: { id: string; entryId: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json();
    const data: any = {};
    if (body.title !== undefined) data.title = body.title;
    if (body.content !== undefined) data.content = body.content;
    if (body.type !== undefined) data.type = body.type;
    if (body.tags !== undefined) data.tags = Array.isArray(body.tags) ? body.tags : [];

    const updated = await prisma.knowledgeBase.update({
      where: { id: params.entryId },
      data,
    });
    return NextResponse.json(updated);
  } catch (err: any) {
    console.error('PATCH knowledge error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/projects/:id/knowledge/:entryId
export async function DELETE(_req: Request, { params }: { params: { id: string; entryId: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    await prisma.knowledgeBase.delete({ where: { id: params.entryId } });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('DELETE knowledge error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
