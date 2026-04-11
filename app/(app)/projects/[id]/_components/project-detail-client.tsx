'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Plus,
  ChevronDown,
  ChevronRight,
  Pencil,
  Check,
  ListChecks,
  BookOpen,
  FileCode,
  Search,
  Filter,
  X,
  Bot,
  Settings,
  FolderOpen
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatusBadge } from '@/components/shared/status-badge';
import { PriorityDot } from '@/components/shared/priority-dot';
import { PlatformBadge } from '@/components/shared/platform-badge';
import { ActorAvatar } from '@/components/shared/actor-avatar';
import { EmptyState } from '@/components/shared/empty-state';
import { TASK_STATUSES, TASK_PRIORITIES, PLATFORMS } from '@/lib/constants';
import { CreateTaskDialog } from './create-task-dialog';
import { TaskDetailPanel } from './task-detail-panel';
import { EditProjectDialog } from './edit-project-dialog';
import { KnowledgeTab } from './knowledge-tab';
import { ContextTab } from './context-tab';
import { OrchestratorChat } from './orchestrator-chat';
// MissionsTab removed — Bridge Agent deprecated
import { ConfigTab } from './config-tab';
import { ProjectFiles } from './project-files';
import { toast } from 'sonner';

interface ProjectData {
  id: string;
  name: string;
  description: string | null;
  status: string;
  categories: any[];
  tasks: any[];
}

export function ProjectDetailClient({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [project, setProject] = useState<ProjectData | null>(null);
  const [loading, setLoading] = useState(true);
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(new Set());
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [activeTab, setActiveTabState] = useState<'orchestrator' | 'tasks' | 'files' | 'context' | 'knowledge' | 'config'>(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash.replace('#', '');
      if (['orchestrator', 'tasks', 'files', 'context', 'knowledge', 'config'].includes(hash)) {
        return hash as any;
      }
    }
    return 'orchestrator';
  });
  const setActiveTab = (tab: typeof activeTab) => {
    setActiveTabState(tab);
    if (typeof window !== 'undefined') window.location.hash = tab;
  };
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('_all');
  const [filterPriority, setFilterPriority] = useState('_all');
  const [filterPlatform, setFilterPlatform] = useState('_all');
  const [showFilters, setShowFilters] = useState(false);

  const hasActiveFilters = searchQuery || filterStatus !== '_all' || filterPriority !== '_all' || filterPlatform !== '_all';

  const clearFilters = () => {
    setSearchQuery('');
    setFilterStatus('_all');
    setFilterPriority('_all');
    setFilterPlatform('_all');
  };

  const fetchProject = useCallback(() => {
    fetch(`/api/projects/${projectId}`)
      .then((r) => { if (!r.ok) throw new Error('Not found'); return r.json(); })
      .then((d: any) => setProject(d))
      .catch(() => { toast.error('Project not found'); router.replace('/projects'); })
      .finally(() => setLoading(false));
  }, [projectId, router]);

  useEffect(() => { fetchProject(); }, [fetchProject]);

  // Auto-refresh project data every 30s when on tasks tab (picks up captain-created tasks)
  useEffect(() => {
    if (activeTab !== 'tasks') return;
    const interval = setInterval(fetchProject, 30000);
    return () => clearInterval(interval);
  }, [activeTab, fetchProject]);

  const toggleCategory = (catId: string) => {
    setCollapsedCats((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId); else next.add(catId);
      return next;
    });
  };

  const handleStatusToggle = async (task: any) => {
    const newStatus = task.status === 'done' ? 'todo' : 'done';
    try {
      await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      fetchProject();
    } catch { toast.error('Failed to update'); }
  };

  if (loading) {
    return (
      <div className="p-6 max-w-[1200px] mx-auto space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (!project) return null;

  const categories = project.categories ?? [];
  const allTasks = project.tasks ?? [];

  // Apply filters
  const tasks = allTasks.filter((t: any) => {
    if (searchQuery && !t.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (filterStatus !== '_all' && t.status !== filterStatus) return false;
    if (filterPriority !== '_all' && t.priority !== filterPriority) return false;
    if (filterPlatform !== '_all') {
      if (filterPlatform === '_none' && t.platform) return false;
      if (filterPlatform !== '_none' && t.platform !== filterPlatform) return false;
    }
    return true;
  });
  const uncategorized = tasks.filter((t: any) => !t.categoryId);

  const renderTaskRow = (task: any) => (
    <div
      key={task.id}
      className={cn(
        'flex items-center gap-3 px-3 py-2.5 hover:bg-accent/50 transition-colors cursor-pointer rounded-lg group',
        selectedTaskId === task.id && 'bg-accent'
      )}
      onClick={() => setSelectedTaskId(task.id)}
    >
      <button
        onClick={(e) => { e.stopPropagation(); handleStatusToggle(task); }}
        className={cn(
          'h-4.5 w-4.5 rounded border-2 flex items-center justify-center shrink-0 transition-colors',
          task.status === 'done'
            ? 'bg-emerald-500 border-emerald-500 text-white'
            : 'border-muted-foreground/30 hover:border-primary'
        )}
      >
        {task.status === 'done' && <Check className="h-3 w-3" />}
      </button>
      <span className={cn('flex-1 text-sm truncate', task.status === 'done' && 'line-through text-muted-foreground')}>
        {task.title}
      </span>
      {task.platform && <PlatformBadge platform={task.platform} />}
      <PriorityDot priority={task.priority} />
      <StatusBadge status={task.status} />
      <div className="flex -space-x-1.5">
        {(task.assignments ?? []).slice(0, 3).map((a: any) => (
          <ActorAvatar key={a.id} name={a.actor?.name ?? '?'} type={a.actor?.type ?? 'HUMAN'} avatarUrl={a.actor?.avatarUrl} size="sm" />
        ))}
      </div>
    </div>
  );

  const renderCategorySection = (cat: any) => {
    const catTasks = tasks.filter((t: any) => t.categoryId === cat.id);
    const isCollapsed = collapsedCats.has(cat.id);
    return (
      <div key={cat.id} className="border border-border rounded-xl overflow-hidden">
        <button
          onClick={() => toggleCategory(cat.id)}
          className="w-full flex items-center gap-2.5 px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
        >
          {isCollapsed ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: cat.color ?? '#6366f1' }} />
          <span className="font-medium text-sm">{cat.name}</span>
          <span className="text-xs text-muted-foreground font-mono ml-1">{catTasks.length}</span>
        </button>
        {!isCollapsed && (
          <div className="px-1 py-1 space-y-0.5">
            {catTasks.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">No tasks in this category</p>
            ) : (
              catTasks.map(renderTaskRow)
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex h-full">
      <div className={cn('flex-1 overflow-y-auto transition-all', selectedTaskId ? 'mr-0' : '')}>
        <div className="p-6 max-w-[1200px] mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <Button variant="ghost" size="icon-sm" onClick={() => router.push('/projects')}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <h2 className="font-display text-2xl font-bold tracking-tight">{project.name}</h2>
                {project.description && (
                  <p className="text-sm text-muted-foreground mt-1">{project.description}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                <Pencil className="h-3.5 w-3.5 mr-1" />Edit
              </Button>
              {activeTab === 'tasks' && (
                <Button size="sm" onClick={() => setCreateOpen(true)}>
                  <Plus className="h-4 w-4 mr-1" />Add Task
                </Button>
              )}
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="flex items-center gap-1 border-b border-border overflow-x-auto">
            {([
              { key: 'orchestrator' as const, label: 'Orchestrator', icon: Bot },
              { key: 'tasks' as const, label: 'Tasks', icon: ListChecks },
              { key: 'files' as const, label: 'Files', icon: FolderOpen },
              { key: 'context' as const, label: 'Context', icon: FileCode },
              { key: 'knowledge' as const, label: 'Knowledge', icon: BookOpen },
              { key: 'config' as const, label: 'Config', icon: Settings },
            ]).map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.key}
                  onClick={() => { setActiveTab(tab.key); if (tab.key === 'tasks') fetchProject(); if (tab.key !== 'tasks') setSelectedTaskId(null); }}
                  className={cn(
                    'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px',
                    activeTab === tab.key
                      ? 'border-primary text-foreground'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Task Filters */}
          {activeTab === 'tasks' && (
            <div className="space-y-3">
              {/* Search + Filter Toggle */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search tasks..."
                    value={searchQuery}
                    onChange={(e: any) => setSearchQuery(e.target.value)}
                    className="pl-9 h-9 text-sm"
                  />
                  {searchQuery && (
                    <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <Button
                  variant={showFilters ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setShowFilters(!showFilters)}
                  className="shrink-0"
                >
                  <Filter className="h-3.5 w-3.5 mr-1.5" />
                  Filters
                  {hasActiveFilters && !showFilters && (
                    <span className="ml-1.5 h-4 min-w-[16px] rounded-full bg-primary-foreground text-primary text-[10px] font-bold flex items-center justify-center px-1">!</span>
                  )}
                </Button>
              </div>

              {/* Filter Row */}
              {showFilters && (
                <div className="flex items-center gap-2 flex-wrap">
                  <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger className="h-8 text-xs w-[130px]"><SelectValue placeholder="Status" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_all">All Status</SelectItem>
                      {TASK_STATUSES.map((s: any) => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={filterPriority} onValueChange={setFilterPriority}>
                    <SelectTrigger className="h-8 text-xs w-[130px]"><SelectValue placeholder="Priority" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_all">All Priority</SelectItem>
                      {TASK_PRIORITIES.map((p: any) => (
                        <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={filterPlatform} onValueChange={setFilterPlatform}>
                    <SelectTrigger className="h-8 text-xs w-[130px]"><SelectValue placeholder="Platform" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_all">All Platforms</SelectItem>
                      <SelectItem value="_none">No Platform</SelectItem>
                      {PLATFORMS.map((p: any) => (
                        <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {hasActiveFilters && (
                    <Button variant="ghost" size="xs" onClick={clearFilters} className="text-xs text-muted-foreground">
                      <X className="h-3 w-3 mr-1" /> Clear
                    </Button>
                  )}
                  <span className="text-xs text-muted-foreground ml-auto">
                    {tasks.length} of {allTasks.length} tasks
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Tab Content: Tasks */}
          {activeTab === 'tasks' && (
          <div className="space-y-3">
            {categories.map(renderCategorySection)}
            {uncategorized.length > 0 && (
              <div className="border border-border rounded-xl overflow-hidden">
                <div className="flex items-center gap-2.5 px-4 py-3 bg-muted/30">
                  <div className="h-2.5 w-2.5 rounded-full bg-gray-400 shrink-0" />
                  <span className="font-medium text-sm">Uncategorized</span>
                  <span className="text-xs text-muted-foreground font-mono ml-1">{uncategorized.length}</span>
                </div>
                <div className="px-1 py-1 space-y-0.5">
                  {uncategorized.map(renderTaskRow)}
                </div>
              </div>
            )}
            {tasks.length === 0 && hasActiveFilters && (
              <EmptyState icon={Search} title="No matching tasks" description="Try adjusting your filters or search query.">
                <Button size="sm" variant="outline" onClick={clearFilters}>
                  <X className="h-4 w-4 mr-1" />Clear Filters
                </Button>
              </EmptyState>
            )}
            {allTasks.length === 0 && !hasActiveFilters && (
              <EmptyState icon={ListChecks} title="No tasks yet" description="Add your first task to this project.">
                <Button size="sm" onClick={() => setCreateOpen(true)}>
                  <Plus className="h-4 w-4 mr-1" />Add Task
                </Button>
              </EmptyState>
            )}
          </div>
          )}

          {/* Tab Content: Orchestrator */}
          {activeTab === 'orchestrator' && (
            <OrchestratorChat projectId={projectId} />
          )}

          {/* Tab Content: Files */}
          {activeTab === 'files' && (
            <ProjectFiles projectId={projectId} />
          )}

          {/* Tab Content: Context */}
          {activeTab === 'context' && (
            <ContextTab projectId={projectId} />
          )}

          {/* Tab Content: Knowledge */}
          {activeTab === 'knowledge' && (
            <KnowledgeTab projectId={projectId} />
          )}

          {/* Tab Content: Config */}
          {activeTab === 'config' && (
            <ConfigTab projectId={projectId} />
          )}
        </div>
      </div>

      {/* Task Detail Panel */}
      {selectedTaskId && (
        <TaskDetailPanel
          taskId={selectedTaskId}
          onClose={() => setSelectedTaskId(null)}
          onUpdate={fetchProject}
        />
      )}

      <CreateTaskDialog
        projectId={projectId}
        categories={categories}
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={fetchProject}
      />

      <EditProjectDialog
        project={project}
        open={editOpen}
        onOpenChange={setEditOpen}
        onUpdated={fetchProject}
      />
    </div>
  );
}
