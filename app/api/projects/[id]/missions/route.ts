export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

// GET /api/projects/:id/missions
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const status = url.searchParams.get('status');

  const where: any = { projectId: params.id };
  if (status && status !== 'all') where.status = status;

  const missions = await prisma.agentMission.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }],
    take: 50,
  });

  const counts = await prisma.agentMission.groupBy({
    by: ['status'],
    where: { projectId: params.id },
    _count: true,
  });

  const statusCounts: Record<string, number> = {};
  counts.forEach((c: any) => { statusCounts[c.status] = c._count; });

  return NextResponse.json({ missions, statusCounts });
}

// POST /api/projects/:id/missions — create a mission
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { title, prompt, targetService, missionType, priority } = body;

  if (!title?.trim() || !prompt?.trim()) {
    return NextResponse.json({ error: 'Title and prompt are required' }, { status: 400 });
  }

  const mission = await prisma.agentMission.create({
    data: {
      projectId: params.id,
      title: title.trim(),
      prompt: prompt.trim(),
      targetService: targetService || 'general',
      missionType: missionType || 'data_pull',
      priority: priority || 0,
    },
  });

  return NextResponse.json(mission, { status: 201 });
}
