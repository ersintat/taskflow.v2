'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  FolderKanban,
  ListChecks,
  CheckCircle2,
  Clock,
  ArrowRight,
  Activity,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ActorAvatar } from '@/components/shared/actor-avatar';
import { EVENT_TYPE_LABELS } from '@/lib/constants';
import { formatDistanceToNow } from 'date-fns';

interface DashboardData {
  stats: { totalProjects: number; totalTasks: number; completedTasks: number; inProgressTasks: number };
  projects: { id: string; name: string; taskCount: number; updatedAt: string | null }[];
  recentActivities: any[];
}

export function DashboardClient() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/dashboard')
      .then((r) => {
        if (!r.ok) throw new Error('Unauthorized');
        return r.json();
      })
      .then((d: any) => {
        if (d?.stats) setData(d);
      })
      .catch((e) => console.error('[dashboard_client]', e))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i: number) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    );
  }

  const stats = data?.stats ?? { totalProjects: 0, totalTasks: 0, completedTasks: 0, inProgressTasks: 0 };

  const statCards = [
    { label: 'Projects', value: stats.totalProjects, icon: FolderKanban, color: 'text-indigo-500 bg-indigo-500/10' },
    { label: 'Total Tasks', value: stats.totalTasks, icon: ListChecks, color: 'text-blue-500 bg-blue-500/10' },
    { label: 'Completed', value: stats.completedTasks, icon: CheckCircle2, color: 'text-emerald-500 bg-emerald-500/10' },
    { label: 'In Progress', value: stats.inProgressTasks, icon: Clock, color: 'text-amber-500 bg-amber-500/10' },
  ];

  return (
    <div className="p-6 space-y-6 max-w-[1200px] mx-auto">
      <div>
        <h2 className="font-display text-2xl font-bold tracking-tight">Overview</h2>
        <p className="text-sm text-muted-foreground mt-1">A snapshot of your workspace activity</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((s: any) => (
          <Card key={s.label} className="border border-border">
            <CardContent className="p-4 flex items-center gap-4">
              <div className={cn('rounded-lg p-2.5', s.color)}>
                <s.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-bold font-mono">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Completion progress */}
      {stats.totalTasks > 0 && (
        <Card className="border border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium">Overall Progress</p>
              <p className="text-sm font-mono text-muted-foreground">
                {stats.completedTasks}/{stats.totalTasks} tasks completed
              </p>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 to-emerald-500 rounded-full transition-all duration-500"
                style={{ width: `${Math.round((stats.completedTasks / stats.totalTasks) * 100)}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              {Math.round((stats.completedTasks / stats.totalTasks) * 100)}% complete
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Projects */}
        <Card className="border border-border">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <FolderKanban className="h-4 w-4 text-muted-foreground" />
              Recent Projects
            </h3>
            <Link href="/projects" className="text-xs text-primary hover:underline flex items-center gap-1">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="divide-y divide-border">
            {(data?.projects ?? []).length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                No projects yet. Create one to get started.
              </div>
            ) : (
              (data?.projects ?? []).map((p: any) => (
                <Link
                  key={p.id}
                  href={`/projects/${p.id}`}
                  className="flex items-center justify-between p-3 hover:bg-accent/50 transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.taskCount} task{p.taskCount !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </Link>
              ))
            )}
          </div>
        </Card>

        {/* Recent Activities */}
        <Card className="border border-border">
          <div className="p-4 border-b border-border">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <Activity className="h-4 w-4 text-muted-foreground" />
              Recent Activity
            </h3>
          </div>
          <div className="divide-y divide-border max-h-[360px] overflow-y-auto">
            {(data?.recentActivities ?? []).length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                No activity yet. Start by creating tasks.
              </div>
            ) : (
              (data?.recentActivities ?? []).map((a: any) => (
                <div key={a.id} className="flex items-start gap-3 p-3">
                  {a.actor ? (
                    <ActorAvatar name={a.actor?.name ?? '?'} type={a.actor?.type ?? 'HUMAN'} avatarUrl={a.actor?.avatarUrl} size="sm" />
                  ) : (
                    <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center">
                      <Activity className="h-3 w-3 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">
                      <span className="font-medium">{a.actor?.name ?? 'System'}</span>{' '}
                      <span className="text-muted-foreground">{EVENT_TYPE_LABELS[a.eventType] ?? a.eventType}</span>
                    </p>
                    {a.task && (
                      <p className="text-xs text-muted-foreground truncate">{a.task?.title}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {a.createdAt ? formatDistanceToNow(new Date(a.createdAt), { addSuffix: true }) : ''}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
