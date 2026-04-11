export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

// GET /api/projects/:id/missions/:missionId
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string; missionId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const mission = await prisma.agentMission.findUnique({
    where: { id: params.missionId },
    include: { project: { select: { id: true, name: true } } },
  });

  if (!mission || mission.projectId !== params.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json(mission);
}

// PATCH /api/projects/:id/missions/:missionId — cancel or re-queue
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; missionId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { action } = await req.json();

  const mission = await prisma.agentMission.findUnique({ where: { id: params.missionId } });
  if (!mission || mission.projectId !== params.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (action === 'cancel') {
    const updated = await prisma.agentMission.update({
      where: { id: params.missionId },
      data: { status: 'cancelled' },
    });
    return NextResponse.json(updated);
  }

  if (action === 'retry') {
    const updated = await prisma.agentMission.update({
      where: { id: params.missionId },
      data: { status: 'pending', result: null, errorMessage: null, logs: null, claimedAt: null, completedAt: null },
    });
    return NextResponse.json(updated);
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

// DELETE /api/projects/:id/missions/:missionId
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; missionId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await prisma.agentMission.delete({ where: { id: params.missionId } }).catch(() => {});

  return NextResponse.json({ ok: true });
}
