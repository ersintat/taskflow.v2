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
    const { projectId, categoryId, title, description, priority, taskType, actorId, platform } = body ?? {};
    if (!projectId || !title?.trim()) {
      return NextResponse.json({ error: 'Project and title are required' }, { status: 400 });
    }
    const userId = (session.user as any)?.id;
    const task = await prisma.task.create({
      data: {
        projectId,
        categoryId: categoryId || null,
        title: title.trim(),
        description: description?.trim() ?? null,
        priority: priority ?? 'medium',
        taskType: taskType ?? 'action',
        platform: platform || null,
        createdBy: userId,
      },
    });
    // Create assignment if actorId provided
    if (actorId) {
      await prisma.taskAssignment.create({
        data: { taskId: task.id, actorId, role: 'ASSIGNEE' },
      });
    }
    // Create activity
    await prisma.taskActivity.create({
      data: {
        taskId: task.id,
        eventType: 'task_created',
        description: `Task "${task.title}" was created`,
      },
    });
    return NextResponse.json(task, { status: 201 });
  } catch (err: any) {
    console.error('POST /api/tasks error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
