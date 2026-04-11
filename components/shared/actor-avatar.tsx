'use client';

import { cn } from '@/lib/utils';
import { Bot, Cpu } from 'lucide-react';

interface ActorAvatarProps {
  name: string;
  type: string;
  avatarUrl?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeMap = { sm: 'h-6 w-6 text-[10px]', md: 'h-8 w-8 text-xs', lg: 'h-10 w-10 text-sm' };
const imgSize = { sm: 24, md: 32, lg: 40 };
const iconSize = { sm: 12, md: 14, lg: 18 };

export function ActorAvatar({ name, type, avatarUrl, size = 'md', className }: ActorAvatarProps) {
  const s = sizeMap[size] ?? sizeMap.md;
  const iSize = iconSize[size] ?? 14;

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        title={name}
        width={imgSize[size]}
        height={imgSize[size]}
        className={cn('rounded-full object-cover shrink-0 border border-border', s, className)}
      />
    );
  }

  const initials = (name ?? '')
    .split(' ')
    .map((w: string) => w?.[0] ?? '')
    .join('')
    .toUpperCase()
    .slice(0, 2);

  if (type === 'AGENT') {
    return (
      <div className={cn('rounded-full bg-indigo-500 text-white flex items-center justify-center shrink-0', s, className)} title={name}>
        <Bot size={iSize} />
      </div>
    );
  }
  if (type === 'SYSTEM') {
    return (
      <div className={cn('rounded-full bg-slate-500 text-white flex items-center justify-center shrink-0', s, className)} title={name}>
        <Cpu size={iSize} />
      </div>
    );
  }
  return (
    <div className={cn('rounded-full bg-emerald-500 text-white flex items-center justify-center font-semibold shrink-0', s, className)} title={name}>
      {initials}
    </div>
  );
}
