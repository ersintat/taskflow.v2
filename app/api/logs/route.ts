export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

// GET /api/logs — get system logs
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const category = searchParams.get('category');
  const level = searchParams.get('level');
  const projectId = searchParams.get('projectId');
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200);

  const where: any = {};
  if (category && category !== 'all') where.category = category;
  if (level && level !== 'all') where.level = level;
  if (projectId && projectId !== 'all') where.projectId = projectId;

  const [logs, total, projects] = await Promise.all([
    prisma.systemLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        project: { select: { name: true } },
      },
    }),
    prisma.systemLog.count({ where }),
    prisma.project.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  return NextResponse.json({ logs, total, projects });
}

// DELETE /api/logs — clear logs (optionally by filters)
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const olderThanDays = parseInt(searchParams.get('olderThan') || '0');

  if (olderThanDays > 0) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - olderThanDays);
    await prisma.systemLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
  } else {
    await prisma.systemLog.deleteMany();
  }

  return NextResponse.json({ ok: true });
}
