'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Rocket, Plus, Clock, CheckCircle2, XCircle, Loader2, RotateCcw,
  Ban, ChevronDown, ChevronRight, ExternalLink, Terminal,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { PLATFORMS } from '@/lib/constants';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

const MISSION_TYPES = [
  { value: 'data_pull', label: 'Data Pull', icon: '📥' },
  { value: 'analysis', label: 'Analysis', icon: '🔍' },
  { value: 'action', label: 'Action', icon: '⚡' },
  { value: 'report', label: 'Report', icon: '📊' },
];

const SERVICES = [
  { value: 'shopify', label: 'Shopify' },
  { value: 'gmc', label: 'Google Merchant Center' },
  { value: 'google_ads', label: 'Google Ads' },
  { value: 'meta', label: 'Meta Ads' },
  { value: 'ga4', label: 'Google Analytics 4' },
  { value: 'gsc', label: 'Google Search Console' },
  { value: 'klaviyo', label: 'Klaviyo' },
  { value: 'general', label: 'General' },
];

const STATUS_CONFIG: Record<string, { icon: any; color: string; label: string }> = {
  pending: { icon: Clock, color: 'text-amber-500 bg-amber-500/10', label: 'Pending' },
  claimed: { icon: Loader2, color: 'text-blue-500 bg-blue-500/10', label: 'Claimed' },
  running: { icon: Loader2, color: 'text-indigo-500 bg-indigo-500/10', label: 'Running' },
  completed: { icon: CheckCircle2, color: 'text-emerald-500 bg-emerald-500/10', label: 'Completed' },
  failed: { icon: XCircle, color: 'text-red-500 bg-red-500/10', label: 'Failed' },
  cancelled: { icon: Ban, color: 'text-gray-500 bg-gray-500/10', label: 'Cancelled' },
};

export function MissionsTab({ projectId }: { projectId: string }) {
  const [missions, setMissions] = useState<any[]>([]);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [filterStatus, setFilterStatus] = useState('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Create form
  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [targetService, setTargetService] = useState('general');
  const [missionType, setMissionType] = useState('data_pull');
  const [priority, setPriority] = useState('0');
  const [creating, setCreating] = useState(false);

  const fetchMissions = useCallback(() => {
    const params = filterStatus !== 'all' ? `?status=${filterStatus}` : '';
    fetch(`/api/projects/${projectId}/missions${params}`)
      .then((r) => r.json())
      .then((d: any) => {
        setMissions(d.missions ?? []);
        setStatusCounts(d.statusCounts ?? {});
      })
      .catch((e) => console.error('[missions_tab]', e));
  }, [projectId, filterStatus]);

  useEffect(() => {
    fetchMissions();
    const interval = setInterval(fetchMissions, 10000);
    return () => clearInterval(interval);
  }, [fetchMissions]);

  const createMission = async () => {
    if (!title.trim() || !prompt.trim()) {
      toast.error('Title and prompt are required');
      return;
    }
    setCreating(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/missions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          prompt: prompt.trim(),
          targetService,
          missionType,
          priority: parseInt(priority),
        }),
      });
      if (!res.ok) { toast.error('Failed to create'); return; }
      toast.success('Mission created');
      setTitle(''); setPrompt(''); setTargetService('general'); setMissionType('data_pull'); setPriority('0');
      setCreateOpen(false);
      fetchMissions();
    } catch { toast.error('Error creating mission'); }
    finally { setCreating(false); }
  };

  const missionAction = async (missionId: string, action: string) => {
    try {
      await fetch(`/api/projects/${projectId}/missions/${missionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      fetchMissions();
      toast.success(action === 'cancel' ? 'Cancelled' : 'Retrying');
    } catch { toast.error('Action failed'); }
  };

  const deleteMission = async (missionId: string) => {
    if (!confirm('Delete this mission?')) return;
    await fetch(`/api/projects/${projectId}/missions/${missionId}`, { method: 'DELETE' });
    fetchMissions();
  };

  const totalMissions = Object.values(statusCounts).reduce((a: number, b: number) => a + b, 0);

  return (
    <div className="space-y-4">
      {/* Header + Create */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5 flex-wrap">
            {(['all', 'pending', 'running', 'completed', 'failed'] as const).map((s) => {
              const count = s === 'all' ? totalMissions : (statusCounts[s] ?? 0);
              return (
                <button
                  key={s}
                  onClick={() => setFilterStatus(s)}
                  className={cn(
                    'text-xs px-2.5 py-1 rounded-full font-medium transition-colors',
                    filterStatus === s
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-accent'
                  )}
                >
                  {s === 'all' ? 'All' : STATUS_CONFIG[s]?.label ?? s} ({count})
                </button>
              );
            })}
          </div>
        </div>

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-3.5 w-3.5 mr-1.5" /> New Mission
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Create Mission</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div>
                <Label className="text-xs">Title</Label>
                <Input value={title} onChange={(e: any) => setTitle(e.target.value)} placeholder="e.g. Pull Shopify product data" className="mt-1" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Target Service</Label>
                  <Select value={targetService} onValueChange={setTargetService}>
                    <SelectTrigger className="mt-1 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SERVICES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Type</Label>
                  <Select value={missionType} onValueChange={setMissionType}>
                    <SelectTrigger className="mt-1 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MISSION_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.icon} {t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-xs">Priority (0=normal, higher=urgent)</Label>
                <Input type="number" value={priority} onChange={(e: any) => setPriority(e.target.value)} className="mt-1 w-24" />
              </div>
              <div>
                <Label className="text-xs">Prompt for Claude CLI</Label>
                <Textarea
                  value={prompt}
                  onChange={(e: any) => setPrompt(e.target.value)}
                  placeholder="Detailed instructions for the bridge agent..."
                  rows={6}
                  className="mt-1 text-sm font-mono"
                />
              </div>
              <Button onClick={createMission} disabled={creating} className="w-full">
                {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Rocket className="h-4 w-4 mr-2" />}
                Create Mission
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Mission list */}
      {missions.length === 0 ? (
        <EmptyState icon={Rocket} title="No missions yet" description="Create a mission to send to the bridge agent.">
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> New Mission
          </Button>
        </EmptyState>
      ) : (
        <div className="space-y-2">
          {missions.map((m: any) => {
            const sc = STATUS_CONFIG[m.status] ?? STATUS_CONFIG.pending;
            const Icon = sc.icon;
            const isExpanded = expandedId === m.id;
            const service = SERVICES.find((s) => s.value === m.targetService);
            const mType = MISSION_TYPES.find((t) => t.value === m.missionType);

            return (
              <div key={m.id} className="border border-border rounded-xl overflow-hidden">
                <div
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-accent/30 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : m.id)}
                >
                  {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                  <div className={cn('h-7 w-7 rounded-lg flex items-center justify-center shrink-0', sc.color)}>
                    <Icon className={cn('h-3.5 w-3.5', m.status === 'running' || m.status === 'claimed' ? 'animate-spin' : '')} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{m.title}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{service?.label ?? m.targetService}</span>
                      <span>·</span>
                      <span>{mType?.icon} {mType?.label}</span>
                      <span>·</span>
                      <span>{m.createdAt ? formatDistanceToNow(new Date(m.createdAt), { addSuffix: true }) : ''}</span>
                    </div>
                  </div>
                  <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full', sc.color)}>
                    {sc.label}
                  </span>
                </div>

                {isExpanded && (
                  <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
                    {/* Prompt */}
                    <div>
                      <Label className="text-xs text-muted-foreground flex items-center gap-1"><Terminal className="h-3 w-3" /> Prompt</Label>
                      <pre className="mt-1 p-3 rounded-lg bg-muted text-xs font-mono whitespace-pre-wrap max-h-[200px] overflow-y-auto">
                        {m.prompt}
                      </pre>
                    </div>

                    {/* Result */}
                    {m.result && (
                      <div>
                        <Label className="text-xs text-muted-foreground">Result</Label>
                        <pre className="mt-1 p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20 text-xs font-mono whitespace-pre-wrap max-h-[300px] overflow-y-auto">
                          {m.result}
                        </pre>
                      </div>
                    )}

                    {/* Error */}
                    {m.errorMessage && (
                      <div>
                        <Label className="text-xs text-destructive">Error</Label>
                        <pre className="mt-1 p-3 rounded-lg bg-red-500/5 border border-red-500/20 text-xs font-mono whitespace-pre-wrap">
                          {m.errorMessage}
                        </pre>
                      </div>
                    )}

                    {/* Logs */}
                    {m.logs && (
                      <div>
                        <Label className="text-xs text-muted-foreground">Logs</Label>
                        <pre className="mt-1 p-3 rounded-lg bg-muted text-xs font-mono whitespace-pre-wrap max-h-[150px] overflow-y-auto">
                          {m.logs}
                        </pre>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      {['pending', 'claimed', 'running'].includes(m.status) && (
                        <Button size="xs" variant="destructive" onClick={(e: any) => { e.stopPropagation(); missionAction(m.id, 'cancel'); }}>
                          <Ban className="h-3 w-3 mr-1" /> Cancel
                        </Button>
                      )}
                      {['failed', 'cancelled'].includes(m.status) && (
                        <Button size="xs" variant="outline" onClick={(e: any) => { e.stopPropagation(); missionAction(m.id, 'retry'); }}>
                          <RotateCcw className="h-3 w-3 mr-1" /> Retry
                        </Button>
                      )}
                      {['completed', 'failed', 'cancelled'].includes(m.status) && (
                        <Button size="xs" variant="ghost" className="text-destructive" onClick={(e: any) => { e.stopPropagation(); deleteMission(m.id); }}>
                          Delete
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
