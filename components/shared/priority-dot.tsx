'use client';

import { cn } from '@/lib/utils';
import { TASK_PRIORITIES } from '@/lib/constants';

export function PriorityDot({ priority }: { priority: string }) {
  const found = TASK_PRIORITIES.find((p: any) => p.value === priority);
  return (
    <span className={cn('inline-block h-2.5 w-2.5 rounded-full shrink-0', found?.dotColor ?? 'bg-gray-400')} title={found?.label ?? priority} />
  );
}

export function PriorityBadge({ priority }: { priority: string }) {
  const found = TASK_PRIORITIES.find((p: any) => p.value === priority);
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
      <span className={cn('h-2 w-2 rounded-full', found?.dotColor ?? 'bg-gray-400')} />
      {found?.label ?? priority}
    </span>
  );
}
