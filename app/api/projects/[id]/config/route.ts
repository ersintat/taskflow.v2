export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

// GET /api/projects/:id/config
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      claudeWorkDir: true,
      autoMission: true,
      connectedApis: true,
    },
  });

  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  return NextResponse.json(project);
}

// PATCH /api/projects/:id/config
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const data: any = {};

  if (body.claudeWorkDir !== undefined) data.claudeWorkDir = body.claudeWorkDir || null;
  if (body.autoMission !== undefined) data.autoMission = !!body.autoMission;
  if (body.connectedApis !== undefined) data.connectedApis = body.connectedApis ? JSON.stringify(body.connectedApis) : null;

  const updated = await prisma.project.update({
    where: { id: params.id },
    data,
    select: {
      id: true,
      claudeWorkDir: true,
      autoMission: true,
      connectedApis: true,
    },
  });

  // Log the config change
  await prisma.systemLog.create({
    data: {
      projectId: params.id,
      level: 'action',
      category: 'system',
      title: 'Project config updated',
      details: JSON.stringify(data),
    },
  }).catch(() => {});

  return NextResponse.json(updated);
}
