'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, Bot, Cpu, User, Star, CheckCircle2, Circle,
  Clock, AlertTriangle, MessageSquare, Gavel, Activity, Shield,
  Camera, Loader2, Trash2, Save, UserCog, BookOpen, ShieldAlert,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/shared/status-badge';
import { PriorityDot } from '@/components/shared/priority-dot';

// Inline editable text field with save
function EditableTextField({ value, placeholder, onSave }: { value: string; placeholder: string; onSave: (val: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (!editing) {
    return (
      <div
        className="text-xs text-muted-foreground cursor-pointer hover:bg-accent/50 rounded p-2 min-h-[60px] transition-colors whitespace-pre-wrap"
        onClick={() => { setDraft(value); setEditing(true); }}
      >
        {value || <span className="italic opacity-50">{placeholder}</span>}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <textarea
        value={draft}
        onChange={(e: any) => setDraft(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className="w-full text-xs bg-background border border-input rounded-md px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-ring"
        autoFocus
      />
      <div className="flex gap-1.5 justify-end">
        <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={() => setEditing(false)}>Cancel</Button>
        <Button size="sm" className="h-6 text-[10px] px-2" onClick={() => { onSave(draft); setEditing(false); }}>
          <Save className="h-3 w-3 mr-1" />Save
        </Button>
      </div>
    </div>
  );
}

const trustColors: Record<string, string> = {
  full: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  FULL: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  supervised: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  SUPERVISED: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  restricted: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  RESTRICTED: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
};

const typeIcons: Record<string, any> = {
  HUMAN: User,
  AGENT: Bot,
  SYSTEM: Cpu,
};

const typeColors: Record<string, string> = {
  HUMAN: 'bg-emerald-500',
  AGENT: 'bg-indigo-500',
  SYSTEM: 'bg-slate-500',
};

export function ActorDetailClient() {
  const params = useParams();
  const router = useRouter();
  const [actor, setActor] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchActor = useCallback(() => {
    fetch(`/api/actors/${params.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setActor(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [params.id]);

  useEffect(() => { fetchActor(); }, [fetchActor]);

  const handleAvatarUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Max 2MB');
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('avatar', file);
      const res = await fetch(`/api/actors/${params.id}/avatar`, { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Upload failed'); return; }
      setActor((prev: any) => prev ? { ...prev, avatarUrl: data.avatarUrl } : prev);
      toast.success('Avatar updated');
    } catch {
      toast.error('Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [params.id]);

  const handleDelete = useCallback(async () => {
    if (!confirm(`"${actor?.name}" silinecek. Emin misiniz?`)) return;
    try {
      const res = await fetch(`/api/actors/${params.id}`, { method: 'DELETE' });
      if (!res.ok) { toast.error('Delete failed'); return; }
      toast.success('Agent deleted');
      router.push('/actors');
    } catch { toast.error('Delete failed'); }
  }, [actor?.name, params.id, router]);

  const handleFieldSave = useCallback(async (field: string, value: string) => {
    try {
      const res = await fetch(`/api/actors/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value || null }),
      });
      if (!res.ok) { toast.error('Save failed'); return; }
      setActor((prev: any) => prev ? { ...prev, [field]: value || null } : prev);
      toast.success('Saved');
    } catch { toast.error('Save failed'); }
  }, [params.id]);

  const formatDate = (date: string) => {
    const d = new Date(date);
    return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const formatTime = (date: string) => {
    const d = new Date(date);
    return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }) +
      ' ' + d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  };

  if (loading) {
    return (
      <div className="p-6 max-w-[1000px] mx-auto space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 rounded-xl" />
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!actor) {
    return (
      <div className="p-6 max-w-[1000px] mx-auto">
        <Button variant="ghost" size="sm" onClick={() => router.push('/actors')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <div className="mt-12 text-center text-muted-foreground">Agent not found.</div>
      </div>
    );
  }

  const TypeIcon = typeIcons[actor.type] || User;
  const stats = actor.stats || {};
  const tasks = (actor.assignments || []).map((a: any) => a.task).filter(Boolean);

  return (
    <div className="p-6 max-w-[1000px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push('/actors')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
          {actor.avatarUrl ? (
            <img src={actor.avatarUrl} alt={actor.name} className="h-12 w-12 rounded-full object-cover border-2 border-border" />
          ) : (
            <div className={cn('h-12 w-12 rounded-full flex items-center justify-center', typeColors[actor.type] || 'bg-gray-500')}>
              <TypeIcon className="h-6 w-6 text-white" />
            </div>
          )}
          <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            {uploading ? <Loader2 className="h-4 w-4 text-white animate-spin" /> : <Camera className="h-4 w-4 text-white" />}
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
        </div>
        <div className="flex-1">
          <h1 className="font-display text-xl font-bold tracking-tight">{actor.name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="outline" className="text-xs">{actor.type}</Badge>
            <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', trustColors[actor.trustLevel] || 'bg-gray-100 text-gray-700')}>
              <Shield className="h-3 w-3" />
              {actor.trustLevel}
            </span>
            {actor.email && <span className="text-xs text-muted-foreground">{actor.email}</span>}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="text-xs text-muted-foreground">Created {formatDate(actor.createdAt)}</div>
          {actor.type !== 'SYSTEM' && (
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground hover:text-destructive gap-1" onClick={handleDelete}>
              <Trash2 className="h-3 w-3" /> Delete
            </Button>
          )}
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Assigned', value: stats.totalAssigned || 0, icon: Circle, color: 'text-blue-500' },
          { label: 'Completed', value: stats.completed || 0, icon: CheckCircle2, color: 'text-emerald-500' },
          { label: 'In Progress', value: stats.inProgress || 0, icon: Clock, color: 'text-yellow-500' },
          { label: 'Blocked', value: stats.blocked || 0, icon: AlertTriangle, color: 'text-red-500' },
        ].map((s) => (
          <Card key={s.label} className="border">
            <CardContent className="p-4 flex items-center gap-3">
              <s.icon className={cn('h-5 w-5', s.color)} />
              <div>
                <div className="text-2xl font-bold">{s.value}</div>
                <div className="text-xs text-muted-foreground">{s.label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Agent Configuration (only for AGENT type) */}
      {actor.type === 'AGENT' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {([
            { field: 'persona', label: 'Role / Persona', icon: UserCog, placeholder: 'e.g. "Sen kıdemli bir SEO uzmanısın, 10 yıl tecrüben var"', color: 'text-violet-500' },
            { field: 'behavior', label: 'Behavior', icon: BookOpen, placeholder: 'e.g. "Önce analiz et, sonra cevap ver. Asla tahmin yürütme."', color: 'text-blue-500' },
            { field: 'rules', label: 'Rules & Constraints', icon: ShieldAlert, placeholder: 'e.g. "Kaynak göstermeden kesin konuşma. Kişisel veri isteme."', color: 'text-amber-500' },
          ] as const).map((cfg) => (
            <Card key={cfg.field}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <cfg.icon className={cn('h-4 w-4', cfg.color)} /> {cfg.label}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <EditableTextField
                  value={actor[cfg.field] || ''}
                  placeholder={cfg.placeholder}
                  onSave={(val: string) => handleFieldSave(cfg.field, val)}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Capabilities + Activity */}
        <div className="space-y-6">
          {/* Capabilities */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Star className="h-4 w-4 text-amber-500" /> Capabilities
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {(actor.capabilities || []).length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No capabilities defined</p>
              ) : (
                <div className="space-y-2">
                  {(actor.capabilities || []).map((c: any) => (
                    <div key={c.id} className="flex items-center justify-between">
                      <span className="text-sm">{c.capabilityName}</span>
                      <div className="flex gap-0.5">
                        {[1, 2, 3, 4, 5].map((level) => (
                          <div
                            key={level}
                            className={cn(
                              'h-2 w-4 rounded-sm',
                              level <= (c.proficiencyLevel || 0) ? 'bg-amber-500' : 'bg-muted'
                            )}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Activity className="h-4 w-4 text-blue-500" /> Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {(actor.activities || []).length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No activity yet</p>
              ) : (
                <div className="space-y-3 max-h-[300px] overflow-y-auto custom-scrollbar">
                  {(actor.activities || []).slice(0, 15).map((a: any) => (
                    <div key={a.id} className="border-l-2 border-muted pl-3 py-1">
                      <div className="text-xs font-medium">{a.eventType.replace(/_/g, ' ')}</div>
                      <div className="text-xs text-muted-foreground truncate">{a.description}</div>
                      {a.task && <div className="text-[10px] text-muted-foreground mt-0.5">→ {a.task.title}</div>}
                      <div className="text-[10px] text-muted-foreground/60">{formatTime(a.createdAt)}</div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Assigned Tasks */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Assigned Tasks ({tasks.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {tasks.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No tasks assigned to this agent</p>
              ) : (
                <div className="space-y-2 max-h-[500px] overflow-y-auto custom-scrollbar">
                  {tasks.map((t: any) => (
                    <div
                      key={t.id}
                      className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors cursor-pointer"
                      onClick={() => t.project && router.push(`/projects/${t.project.id}`)}
                    >
                      <PriorityDot priority={t.priority} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{t.title}</div>
                        <div className="flex items-center gap-2 mt-1">
                          {t.project && (
                            <span className="text-[10px] text-muted-foreground">{t.project.name}</span>
                          )}
                          {t.platform && (
                            <Badge variant="outline" className="text-[10px] px-1 py-0">{t.platform}</Badge>
                          )}
                        </div>
                      </div>
                      <StatusBadge status={t.status} />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Decisions */}
          {(actor.decisions || []).length > 0 && (
            <Card className="mt-6">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Gavel className="h-4 w-4 text-violet-500" /> Decisions ({actor.decisions.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar">
                  {(actor.decisions || []).map((d: any) => (
                    <div key={d.id} className="p-3 rounded-lg border border-border">
                      <div className="flex items-center gap-2">
                        <Badge variant={d.decisionType === 'APPROVAL' ? 'default' : 'destructive'} className="text-[10px]">
                          {d.decisionType}
                        </Badge>
                        <span className="text-sm font-medium">{d.title}</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{d.decision}</div>
                      {d.task && <div className="text-[10px] text-muted-foreground mt-1">→ {d.task.title}</div>}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Comments */}
          {(actor.comments || []).length > 0 && (
            <Card className="mt-6">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-sky-500" /> Comments ({actor.comments.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar">
                  {(actor.comments || []).map((c: any) => (
                    <div key={c.id} className="p-3 rounded-lg border border-border">
                      <div className="text-sm">{c.content}</div>
                      {c.task && <div className="text-[10px] text-muted-foreground mt-1">→ {c.task.title}</div>}
                      <div className="text-[10px] text-muted-foreground/60 mt-1">{formatTime(c.createdAt)}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
