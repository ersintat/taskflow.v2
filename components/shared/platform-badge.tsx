'use client';

import { cn } from '@/lib/utils';
import { PLATFORMS } from '@/lib/constants';

interface PlatformBadgeProps {
  platform: string;
  size?: 'sm' | 'md';
  className?: string;
}

export function PlatformBadge({ platform, size = 'sm', className }: PlatformBadgeProps) {
  const p = PLATFORMS.find((pl) => pl.value === platform);
  if (!p) return null;

  return (
    <span
      className={cn(
        'inline-flex items-center font-semibold rounded-md whitespace-nowrap',
        size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs',
        p.color,
        className
      )}
      title={p.fullName}
    >
      {p.label}
    </span>
  );
}
