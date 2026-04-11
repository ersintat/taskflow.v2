export const dynamic = 'force-dynamic';
import { NextResponse, NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

// GET /api/projects/:id/knowledge?query=&type=&tags=
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const url = new URL(req.url);
    const query = url.searchParams.get('query') ?? '';
    const type = url.searchParams.get('type') ?? '';
    const tagsParam = url.searchParams.get('tags') ?? '';

    const where: any = { projectId: params.id };
    if (type) where.type = type;
    if (query) {
      where.OR = [
        { title: { contains: query, mode: 'insensitive' } },
        { content: { contains: query, mode: 'insensitive' } },
      ];
    }
    if (tagsParam) {
      const tags = tagsParam.split(',').map((t) => t.trim()).filter(Boolean);
      if (tags.length > 0) where.tags = { contains: tags[0] };
    }

    const entries = await prisma.knowledgeBase.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(entries);
  } catch (err: any) {
    console.error('GET /api/projects/[id]/knowledge error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/projects/:id/knowledge
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json();
    const { title, content, type, tags } = body ?? {};
    if (!title?.trim() || !content?.trim() || !type) {
      return NextResponse.json({ error: 'title, content, and type are required' }, { status: 400 });
    }

    const entry = await prisma.knowledgeBase.create({
      data: {
        projectId: params.id,
        title: title.trim(),
        content: content.trim(),
        type,
        tags: JSON.stringify(Array.isArray(tags) ? tags.filter(Boolean) : []),
        createdBy: (session.user as any)?.id ?? null,
      },
    });

    return NextResponse.json(entry, { status: 201 });
  } catch (err: any) {
    console.error('POST /api/projects/[id]/knowledge error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
