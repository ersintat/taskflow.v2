export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    let totalProjects = 0, totalTasks = 0, completedTasks = 0, inProgressTasks = 0;
    let projects: any[] = [];
    let recentActivities: any[] = [];

    try { totalProjects = await prisma.project.count(); } catch (e: any) { console.error('dashboard: project.count failed', e.message); }
    try { totalTasks = await prisma.task.count(); } catch (e: any) { console.error('dashboard: task.count failed', e.message); }
    try { completedTasks = await prisma.task.count({ where: { status: 'done' } }); } catch (e: any) { console.error('dashboard: done.count failed', e.message); }
    try { inProgressTasks = await prisma.task.count({ where: { status: 'in_progress' } }); } catch (e: any) { console.error('dashboard: progress.count failed', e.message); }
    try {
      projects = await prisma.project.findMany({
        orderBy: { updatedAt: 'desc' },
        take: 5,
        include: { _count: { select: { tasks: true } } },
      });
    } catch (e: any) { console.error('dashboard: projects.findMany failed', e.message); }
    try {
      recentActivities = await prisma.taskActivity.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: {
          actor: true,
          task: { select: { id: true, title: true, projectId: true } },
        },
      });
    } catch (e: any) { console.error('dashboard: activities.findMany failed', e.message); }

    return NextResponse.json({
      stats: { totalProjects, totalTasks, completedTasks, inProgressTasks },
      projects: projects.map((p: any) => ({ id: p.id, name: p.name, taskCount: p._count?.tasks ?? 0, updatedAt: p.updatedAt ? new Date(p.updatedAt).toISOString() : null })),
      recentActivities,
    });
  } catch (err: any) {
    const msg = err?.message || err?.toString?.() || JSON.stringify(err) || 'Unknown error';
    console.error('GET /api/dashboard error:', msg, err?.code, err?.stack?.split('\n')?.[1]);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
