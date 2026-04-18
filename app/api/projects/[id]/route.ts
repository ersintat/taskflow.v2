export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import fs from 'fs';
import path from 'path';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const project = await prisma.project.findUnique({
      where: { id: params.id },
      include: {
        categories: { orderBy: { order: 'asc' } },
        tasks: {
          orderBy: { createdAt: 'desc' },
          include: {
            assignments: { include: { actor: true } },
            category: true,
          },
        },
      },
    });
    if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(project);
  } catch (err: any) {
    console.error('GET /api/projects/[id] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json();
    const updated = await prisma.project.update({
      where: { id: params.id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.status !== undefined && { status: body.status }),
      },
    });
    return NextResponse.json(updated);
  } catch (err: any) {
    console.error('PATCH /api/projects/[id] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const project = await prisma.project.findUnique({ where: { id: params.id }, select: { name: true } });
    if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Cascade deletes handle: categories, tasks, knowledge, contexts, missions,
    // chat, systemLogs, tokenUsage, schedules (defined in schema.prisma)
    await prisma.project.delete({ where: { id: params.id } });

    // Delete workspace directory (contains user-uploaded images, governance docs, etc.)
    const workspacePath = path.join(process.cwd(), 'workspaces', params.id);
    try {
      if (fs.existsSync(workspacePath)) {
        fs.rmSync(workspacePath, { recursive: true, force: true });
        console.log(`[project-delete] Workspace deleted: ${workspacePath}`);
      }
    } catch (e: any) {
      console.error(`[project-delete] Failed to delete workspace ${workspacePath}:`, e.message);
    }

    console.log(`[project-delete] Deleted project "${project.name}" (${params.id}) by user ${session.user.email}`);
    return NextResponse.json({ success: true, message: `Project "${project.name}" deleted` });
  } catch (err: any) {
    console.error('DELETE /api/projects/[id] error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
