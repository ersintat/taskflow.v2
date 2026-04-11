export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') ?? '10', 10);
    const activities = await prisma.taskActivity.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 50),
      include: {
        actor: true,
        task: { select: { id: true, title: true, projectId: true } },
      },
    });
    return NextResponse.json(activities);
  } catch (err: any) {
    console.error('GET /api/activities error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
