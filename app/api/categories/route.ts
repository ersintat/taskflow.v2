export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await request.json();
    const { projectId, name, color } = body ?? {};
    if (!projectId || !name?.trim()) {
      return NextResponse.json({ error: 'projectId and name required' }, { status: 400 });
    }
    const maxOrder = await prisma.taskCategory.findFirst({
      where: { projectId },
      orderBy: { order: 'desc' },
      select: { order: true },
    });
    const cat = await prisma.taskCategory.create({
      data: {
        projectId,
        name: name.trim(),
        color: color ?? '#6366f1',
        order: (maxOrder?.order ?? -1) + 1,
      },
    });
    return NextResponse.json(cat, { status: 201 });
  } catch (err: any) {
    console.error('POST /api/categories error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
