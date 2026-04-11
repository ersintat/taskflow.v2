export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

// GET /api/schedules — list all schedules
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const schedules = await prisma.schedule.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        project: { select: { id: true, name: true } },
        agent: { select: { id: true, name: true, avatarUrl: true, type: true } },
      },
    });

    return NextResponse.json(schedules);
  } catch (err: any) {
    console.error('GET /api/schedules error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
