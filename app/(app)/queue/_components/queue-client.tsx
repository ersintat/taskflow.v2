'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Layers,
  Clock,
  Play,
  CheckCircle2,
  XCircle,
  DollarSign,
  Plus,
  RefreshCw,
  Zap,
  CalendarClock,
  Trash2,
  Pause,
  Power,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ActorAvatar } from '@/components/shared/actor-avatar';
import { StatusBadge } from '@/components/shared/status-badge';
import { PlatformBadge } from '@/components/shared/platform-badge';
import { EmptyState } from '@/components/shared/empty-state';
import { EnqueueDialog } from './enqueue-dialog';
import { formatDistanceToNow } from 'date-fns';

const QUEUE_STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  WAITING: { label: 'Waiting', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300', icon: Clock },
  CLAIMED: { label: 'Claimed', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300', icon: Zap },
  RUNNING: { label: 'Running', color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300', icon: Play },
  COMPLETED: { label: 'Completed', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300', icon: CheckCircle2 },
  FAILED: { label: 'Failed', color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300', icon: XCircle },
};

export function QueueClient() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [enqueueOpen, setEnqueueOpen] = useState(false);
  const [schedules, setSchedules] = useState<any[]>([]);

  const fetchData = useCallback(() => {
    setLoading(true);
    fetch('/api/queue')
      .then((r) => r.json())
      .then((d: any) => setData(d))
      .catch((e) => console.error('[queue_client]', e))
      .finally(() => setLoading(false));
  }, []);

  const fetchSchedules = useCallback(() => {
    fetch('/api/schedules')
      .then((r) => r.ok ? r.json() : [])
      .then((d: any) => setSchedules(Array.isArray(d) ? d : []))
      .catch((e) => console.error('[queue_client]', e));
  }, []);

  useEffect(() => { fetchData(); fetchSchedules(); }, [fetchData, fetchSchedules]);

  const toggleSchedule = async (id: string, isActive: boolean) => {
    await fetch(`/api/schedules/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !isActive }),
    });
    fetchSchedules();
    toast.success(isActive ? 'Schedule paused' : 'Schedule activated');
  };

  const deleteSchedule = async (id: string, name: string) => {
    if (!confirm(`Delete schedule "${name}"? Are you sure?`)) return;
    await fetch(`/api/schedules/${id}`, { method: 'DELETE' });
    fetchSchedules();
    toast.success('Schedule deleted');
  };

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-9 w-32" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  const stats = data?.stats ?? {};
  const items = data?.items ?? [];
  const actorLoads = data?.actorLoads ?? [];
  const totalBudgetCents = data?.totalBudgetCents ?? 0;

  const statCards = [
    { key: 'WAITING', icon: Clock, value: stats.WAITING ?? 0 },
    { key: 'CLAIMED', icon: Zap, value: stats.CLAIMED ?? 0 },
    { key: 'RUNNING', icon: Play, value: stats.RUNNING ?? 0 },
    { key: 'COMPLETED', icon: CheckCircle2, value: stats.COMPLETED ?? 0 },
    { key: 'FAILED', icon: XCircle, value: stats.FAILED ?? 0 },
  ];

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Agent Queue</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Monitor and manage tasks assigned to AI agents
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchData}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh
          </Button>
          <Button size="sm" onClick={() => setEnqueueOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Enqueue Task
          </Button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {statCards.map((s) => {
          const cfg = QUEUE_STATUS_CONFIG[s.key];
          const Icon = s.icon;
          return (
            <Card key={s.key} className="border-border/50">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <div className={cn('p-1.5 rounded-md', cfg.color)}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <span className="text-xs text-muted-foreground font-medium">{cfg.label}</span>
                </div>
                <p className="text-2xl font-bold">{s.value}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Budget + Actor Load */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Total Budget */}
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              Total Budget Allocated
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              ${(totalBudgetCents / 100).toFixed(2)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Across all queue items</p>
          </CardContent>
        </Card>

        {/* Actor Load */}
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Active Agent Load</CardTitle>
          </CardHeader>
          <CardContent>
            {actorLoads.length === 0 ? (
              <p className="text-sm text-muted-foreground">No agents currently active</p>
            ) : (
              <div className="space-y-3">
                {actorLoads.map((load: any) => (
                  <div key={load.actor.id} className="flex items-center gap-3">
                    <ActorAvatar name={load.actor.name} type={load.actor.type} avatarUrl={load.actor.avatarUrl} size="sm" />
                    <span className="text-sm flex-1">{load.actor.name}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-indigo-500 rounded-full transition-all"
                          style={{ width: `${Math.min(load.activeCount * 25, 100)}%` }}
                        />
                      </div>
                      <span className="text-xs font-medium tabular-nums">{load.activeCount}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Queue Items */}
      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Queue Items</CardTitle>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <EmptyState
              icon={Layers}
              title="Queue is empty"
              description="Enqueue tasks to assign them to AI agents for autonomous processing."
            />
          ) : (
            <div className="space-y-1">
              {/* Table header */}
              <div className="grid grid-cols-12 gap-2 px-3 py-2 text-xs text-muted-foreground font-medium border-b border-border">
                <div className="col-span-4">Task</div>
                <div className="col-span-2">Status</div>
                <div className="col-span-2">Agent</div>
                <div className="col-span-2">Priority</div>
                <div className="col-span-2">Queued</div>
              </div>
              {items.map((item: any) => {
                const cfg = QUEUE_STATUS_CONFIG[item.status] ?? QUEUE_STATUS_CONFIG.WAITING;
                return (
                  <div
                    key={item.id}
                    className="grid grid-cols-12 gap-2 items-center px-3 py-2.5 rounded-lg hover:bg-accent/50 transition-colors"
                  >
                    <div className="col-span-4 flex items-center gap-2 min-w-0">
                      <span className="text-sm truncate">{item.task?.title ?? 'Unknown'}</span>
                      {item.task?.platform && <PlatformBadge platform={item.task.platform} />}
                    </div>
                    <div className="col-span-2">
                      <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium', cfg.color)}>
                        {cfg.label}
                      </span>
                    </div>
                    <div className="col-span-2">
                      {item.claimer ? (
                        <div className="flex items-center gap-1.5">
                          <ActorAvatar name={item.claimer.name} type={item.claimer.type} avatarUrl={item.claimer.avatarUrl} size="sm" />
                          <span className="text-xs truncate">{item.claimer.name}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </div>
                    <div className="col-span-2">
                      <span className="text-xs font-medium">{item.priority}</span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-xs text-muted-foreground">
                        {item.createdAt ? formatDistanceToNow(new Date(item.createdAt), { addSuffix: true }) : ''}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Scheduled Queue */}
      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-muted-foreground" />
              Scheduled Queue
            </CardTitle>
            <span className="text-xs text-muted-foreground">{schedules.length} schedule(s)</span>
          </div>
        </CardHeader>
        <CardContent>
          {schedules.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <CalendarClock className="h-8 w-8 mb-2 opacity-30" />
              <p className="text-sm">No scheduled tasks</p>
              <p className="text-xs opacity-60 mt-1">Captain can create schedules via create_schedule tool</p>
            </div>
          ) : (
            <div className="space-y-1">
              <div className="grid grid-cols-12 gap-2 px-3 py-2 text-xs text-muted-foreground font-medium border-b border-border">
                <div className="col-span-3">Name</div>
                <div className="col-span-2">Cron</div>
                <div className="col-span-2">Action</div>
                <div className="col-span-2">Next Run</div>
                <div className="col-span-1">Runs</div>
                <div className="col-span-2 text-right">Actions</div>
              </div>
              {schedules.map((s: any) => (
                <div
                  key={s.id}
                  className={cn(
                    'grid grid-cols-12 gap-2 items-center px-3 py-2.5 rounded-lg hover:bg-accent/50 transition-colors',
                    !s.isActive && 'opacity-50'
                  )}
                >
                  <div className="col-span-3 min-w-0">
                    <div className="text-sm font-medium truncate">{s.name}</div>
                    {s.project && <div className="text-[10px] text-muted-foreground truncate">{s.project.name}</div>}
                  </div>
                  <div className="col-span-2">
                    <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{s.cron}</code>
                  </div>
                  <div className="col-span-2">
                    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium', {
                      'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300': s.action === 'create_task',
                      'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300': s.action === 'enqueue_task',
                      'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300': s.action === 'run_agent',
                    })}>
                      {s.action.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-xs text-muted-foreground">
                      {s.nextRunAt ? formatDistanceToNow(new Date(s.nextRunAt), { addSuffix: true }) : '—'}
                    </span>
                  </div>
                  <div className="col-span-1">
                    <span className="text-xs font-medium tabular-nums">{s.runCount}</span>
                  </div>
                  <div className="col-span-2 flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="h-7 w-7"
                      onClick={() => toggleSchedule(s.id, s.isActive)}
                      title={s.isActive ? 'Pause' : 'Activate'}
                    >
                      {s.isActive ? <Pause className="h-3.5 w-3.5 text-amber-500" /> : <Power className="h-3.5 w-3.5 text-emerald-500" />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="h-7 w-7 hover:text-destructive"
                      onClick={() => deleteSchedule(s.id, s.name)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {schedules.some((s: any) => s.lastError) && (
            <div className="mt-3 space-y-1">
              {schedules.filter((s: any) => s.lastError).map((s: any) => (
                <div key={s.id} className="text-xs bg-red-950/20 border border-red-500/20 rounded px-3 py-1.5 text-red-400">
                  <span className="font-medium">{s.name}:</span> {s.lastError}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <EnqueueDialog open={enqueueOpen} onOpenChange={setEnqueueOpen} onCreated={fetchData} />
    </div>
  );
}
