'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  ScrollText, Filter, Trash2, RefreshCw, Info, AlertTriangle,
  XCircle, Zap, Rocket, Bot, Settings, Server, Globe,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { formatDistanceToNow, format } from 'date-fns';

interface LogEntry {
  id: string;
  projectId: string | null;
  level: string;
  category: string;
  title: string;
  details: string | null;
  createdAt: string;
  project: { name: string } | null;
}

const LEVEL_CONFIG: Record<string, { icon: any; color: string }> = {
  info: { icon: Info, color: 'text-blue-500 bg-blue-500/10' },
  warning: { icon: AlertTriangle, color: 'text-amber-500 bg-amber-500/10' },
  error: { icon: XCircle, color: 'text-red-500 bg-red-500/10' },
  action: { icon: Zap, color: 'text-emerald-500 bg-emerald-500/10' },
};

const CATEGORY_CONFIG: Record<string, { icon: any; label: string }> = {
  orchestrator: { icon: Bot, label: 'Orchestrator' },
  mission: { icon: Rocket, label: 'Mission' },
  bridge: { icon: Server, label: 'Bridge' },
  system: { icon: Settings, label: 'System' },
  api: { icon: Globe, label: 'API' },
};

export function LogsClient() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterLevel, setFilterLevel] = useState('all');
  const [filterProject, setFilterProject] = useState('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchLogs = useCallback(() => {
    const params = new URLSearchParams();
    if (filterCategory !== 'all') params.set('category', filterCategory);
    if (filterLevel !== 'all') params.set('level', filterLevel);
    if (filterProject !== 'all') params.set('projectId', filterProject);
    params.set('limit', '100');

    setLoading(true);
    fetch(`/api/logs?${params}`)
      .then((r) => r.json())
      .then((d: any) => {
        setLogs(d.logs || []);
        setTotal(d.total || 0);
        setProjects(d.projects || []);
      })
      .catch(() => toast.error('Failed to load logs'))
      .finally(() => setLoading(false));
  }, [filterCategory, filterLevel, filterProject]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const clearLogs = async () => {
    if (!confirm('Clear all system logs?')) return;
    await fetch('/api/logs', { method: 'DELETE' });
    setLogs([]);
    setTotal(0);
    toast.success('Logs cleared');
  };

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-indigo-500/10 flex items-center justify-center">
            <ScrollText className="h-5 w-5 text-indigo-500" />
          </div>
          <div>
            <h1 className="text-xl font-bold">System Logs</h1>
            <p className="text-sm text-muted-foreground">{total} log entries</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchLogs}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
          </Button>
          {logs.length > 0 && (
            <Button variant="outline" size="sm" onClick={clearLogs} className="text-red-500 hover:text-red-600">
              <Trash2 className="h-3.5 w-3.5 mr-1" /> Clear All
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-[160px] h-8 text-xs">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {Object.entries(CATEGORY_CONFIG).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterLevel} onValueChange={setFilterLevel}>
          <SelectTrigger className="w-[140px] h-8 text-xs">
            <SelectValue placeholder="Level" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Levels</SelectItem>
            <SelectItem value="info">Info</SelectItem>
            <SelectItem value="warning">Warning</SelectItem>
            <SelectItem value="error">Error</SelectItem>
            <SelectItem value="action">Action</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterProject} onValueChange={setFilterProject}>
          <SelectTrigger className="w-[180px] h-8 text-xs">
            <SelectValue placeholder="Project" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Projects</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Log list */}
      <div className="border border-border rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Loading logs...</div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <ScrollText className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm font-medium">No logs yet</p>
            <p className="text-xs mt-1">System events will appear here as actions are taken.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {logs.map((log) => {
              const levelCfg = LEVEL_CONFIG[log.level] || LEVEL_CONFIG.info;
              const catCfg = CATEGORY_CONFIG[log.category] || CATEGORY_CONFIG.system;
              const LevelIcon = levelCfg.icon;
              const CatIcon = catCfg.icon;
              const expanded = expandedId === log.id;

              return (
                <div
                  key={log.id}
                  className={cn(
                    'px-4 py-3 hover:bg-muted/30 transition-colors cursor-pointer',
                    expanded && 'bg-muted/20'
                  )}
                  onClick={() => setExpandedId(expanded ? null : log.id)}
                >
                  <div className="flex items-start gap-3">
                    <div className={cn('h-7 w-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5', levelCfg.color)}>
                      <LevelIcon className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{log.title}</span>
                        <span className={cn('inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md border', 'text-muted-foreground bg-muted/50')}>
                          <CatIcon className="h-2.5 w-2.5" /> {catCfg.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {log.project && (
                          <span className="text-[10px] text-indigo-500 font-medium">{log.project.name}</span>
                        )}
                        <span className="text-[10px] text-muted-foreground">
                          {format(new Date(log.createdAt), 'dd MMM HH:mm:ss')}
                          {' \u00b7 '}
                          {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })}
                        </span>
                      </div>
                    </div>
                  </div>
                  {expanded && log.details && (
                    <div className="mt-2 ml-10 p-3 bg-muted/30 rounded-lg">
                      <pre className="text-xs whitespace-pre-wrap break-words font-mono text-muted-foreground">
                        {log.details}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
