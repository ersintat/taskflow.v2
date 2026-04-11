export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

// GET /api/projects/:id/context/:key — get all versions of a key
export async function GET(_req: Request, { params }: { params: { id: string; key: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const versions = await prisma.projectContext.findMany({
      where: { projectId: params.id, key: decodeURIComponent(params.key) },
      orderBy: { version: 'desc' },
    });

    return NextResponse.json(versions);
  } catch (err: any) {
    console.error('GET context key error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT /api/projects/:id/context/:key — create new version
export async function PUT(req: Request, { params }: { params: { id: string; key: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json();
    const { value } = body ?? {};
    if (value === undefined || value === null) {
      return NextResponse.json({ error: 'value is required' }, { status: 400 });
    }

    const decodedKey = decodeURIComponent(params.key);

    // Find current max version
    const current = await prisma.projectContext.findFirst({
      where: { projectId: params.id, key: decodedKey },
      orderBy: { version: 'desc' },
    });

    const nextVersion = current ? current.version + 1 : 1;

    const created = await prisma.projectContext.create({
      data: {
        projectId: params.id,
        key: decodedKey,
        value,
        version: nextVersion,
        createdBy: (session.user as any)?.id ?? null,
      },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (err: any) {
    console.error('PUT context key error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/projects/:id/context/:key — delete all versions of a key
export async function DELETE(_req: Request, { params }: { params: { id: string; key: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await prisma.projectContext.deleteMany({
      where: { projectId: params.id, key: decodeURIComponent(params.key) },
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('DELETE context key error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
