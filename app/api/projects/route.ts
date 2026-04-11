export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import fs from 'fs';
import path from 'path';

const PROJECT_COLORS = [
  '#f97316', // orange
  '#3b82f6', // blue
  '#22c55e', // green
  '#eab308', // yellow
  '#ef4444', // red
  '#06b6d4', // cyan
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#14b8a6', // teal
  '#a855f7', // purple
];

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const projects = await prisma.project.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { tasks: true } },
        tasks: { select: { status: true } },
      },
    });
    const data = projects.map((p: any) => {
      const statusCounts: Record<string, number> = {};
      (p.tasks ?? []).forEach((t: any) => {
        statusCounts[t.status] = (statusCounts[t.status] ?? 0) + 1;
      });
      return {
        id: p.id,
        name: p.name,
        description: p.description,
        status: p.status,
        color: p.color || '#6366f1',
        createdAt: p.createdAt?.toISOString?.() ?? null,
        taskCount: p._count?.tasks ?? 0,
        statusCounts,
      };
    });
    return NextResponse.json(data);
  } catch (err: any) {
    console.error('GET /api/projects error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await request.json();
    const { name, description } = body ?? {};
    if (!name?.trim()) return NextResponse.json({ error: 'Project name is required' }, { status: 400 });
    let userId = (session.user as any)?.id;
    // Verify user exists (JWT may contain stale ID after DB cleanup)
    const userExists = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!userExists) {
      const userByEmail = await prisma.user.findUnique({ where: { email: session.user.email! }, select: { id: true } });
      if (!userByEmail) return NextResponse.json({ error: 'User not found. Please log out and log in again.' }, { status: 401 });
      userId = userByEmail.id;
    }
    const color = PROJECT_COLORS[Math.floor(Math.random() * PROJECT_COLORS.length)];
    const project = await prisma.project.create({
      data: {
        name: name.trim(),
        description: description?.trim() ?? null,
        color,
        ownerId: userId,
      },
    });
    // Create workspace directory
    const workspacePath = path.join(process.cwd(), 'workspaces', project.id);
    if (!fs.existsSync(workspacePath)) {
      fs.mkdirSync(workspacePath, { recursive: true });
    }

    // Create default categories
    await prisma.taskCategory.createMany({
      data: [
        { projectId: project.id, name: 'Backlog', color: '#6b7280', order: 0 },
        { projectId: project.id, name: 'In Progress', color: '#3b82f6', order: 1 },
        { projectId: project.id, name: 'Review', color: '#f59e0b', order: 2 },
        { projectId: project.id, name: 'Done', color: '#10b981', order: 3 },
      ],
    });
    return NextResponse.json(project, { status: 201 });
  } catch (err: any) {
    console.error('POST /api/projects error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
