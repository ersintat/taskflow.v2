import { prisma } from '@/lib/db';

const STATUS_TO_CATEGORY: Record<string, string> = {
  todo: 'Backlog',
  blocked: 'Backlog',
  in_progress: 'In Progress',
  pending_review: 'Review',
  pending_acceptance: 'Review',
  done: 'Done',
  cancelled: 'Done',
};

/**
 * Auto-move task to the matching category when status changes.
 * Call this after updating a task's status.
 */
export async function syncTaskCategory(taskId: string, newStatus: string): Promise<void> {
  const targetCatName = STATUS_TO_CATEGORY[newStatus];
  if (!targetCatName) return;

  try {
    const task = await prisma.task.findUnique({ where: { id: taskId }, select: { projectId: true } });
    if (!task) return;

    const category = await prisma.taskCategory.findFirst({
      where: { projectId: task.projectId, name: targetCatName },
    });
    if (category) {
      await prisma.task.update({
        where: { id: taskId },
        data: { categoryId: category.id },
      });
    }
  } catch (e: any) { console.error('[syncTaskCategory]', taskId, e.message); }
}
