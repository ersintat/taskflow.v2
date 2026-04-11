'use client';

import { cn } from '@/lib/utils';
import { TASK_STATUSES } from '@/lib/constants';

export function StatusBadge({ status }: { status: string }) {
  const found = TASK_STATUSES.find((s: any) => s.value === status);
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', found?.color ?? 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300')}>
      {found?.label ?? status}
    </span>
  );
}
