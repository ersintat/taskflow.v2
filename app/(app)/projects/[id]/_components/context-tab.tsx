'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  FileCode,
  Plus,
  Save,
  History,
  Trash2,
  X,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

const TEMPLATE_KEYS = [
  { key: 'brief', label: 'Project Brief', description: 'Overview, goals, and scope of the project' },
  { key: 'tech-stack', label: 'Tech Stack', description: 'Technologies, tools, and infrastructure used' },
  { key: 'agent-instructions', label: 'Agent Instructions', description: 'Guidelines for AI agents working on this project' },
  { key: 'workflow', label: 'Workflow', description: 'Process and workflow documentation' },
  { key: 'brand-guidelines', label: 'Brand Guidelines', description: 'Visual identity and brand rules' },
];

interface Props {
  projectId: string;
}

export function ContextTab({ projectId }: Props) {
  const [contexts, setContexts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [versions, setVersions] = useState<any[]>([]);
  const [showVersions, setShowVersions] = useState(false);

  const fetchContexts = useCallback(() => {
    setLoading(true);
    fetch(`/api/projects/${projectId}/context`)
      .then((r) => r.json())
      .then((d: any) => setContexts(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => { fetchContexts(); }, [fetchContexts]);

  const selectContext = (ctx: any) => {
    setSelectedKey(ctx.key);
    setEditValue(ctx.value);
    setShowVersions(false);
  };

  const fetchVersions = async (key: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/context/${encodeURIComponent(key)}`);
      const data = await res.json();
      setVersions(Array.isArray(data) ? data : []);
      setShowVersions(true);
    } catch { toast.error('Failed to load versions'); }
  };

  const handleSave = async () => {
    if (!selectedKey) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/context/${encodeURIComponent(selectedKey)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: editValue }),
      });
      if (!res.ok) { toast.error('Failed to save'); return; }
      toast.success('Context saved (new version created)');
      fetchContexts();
    } catch { toast.error('Something went wrong'); } finally { setSaving(false); }
  };

  const handleCreate = async () => {
    if (!newKey.trim()) { toast.error('Key is required'); return; }
    try {
      const res = await fetch(`/api/projects/${projectId}/context/${encodeURIComponent(newKey.trim())}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: newValue }),
      });
      if (!res.ok) { toast.error('Failed to create'); return; }
      toast.success('Context document created');
      setNewKey(''); setNewValue('');
      setCreateOpen(false);
      fetchContexts();
    } catch { toast.error('Something went wrong'); }
  };

  const handleDelete = async (key: string) => {
    try {
      await fetch(`/api/projects/${projectId}/context/${encodeURIComponent(key)}`, { method: 'DELETE' });
      toast.success('Context deleted');
      if (selectedKey === key) { setSelectedKey(null); setEditValue(''); }
      fetchContexts();
    } catch { toast.error('Failed to delete'); }
  };

  const handleTemplateSelect = (template: typeof TEMPLATE_KEYS[0]) => {
    setNewKey(template.key);
    setNewValue(`# ${template.label}\n\n${template.description}\n\n---\n\nWrite your content here...`);
  };

  const currentCtx = contexts.find((c) => c.key === selectedKey);

  return (
    <div className="flex gap-4 min-h-[400px]">
      {/* Sidebar - Context Keys */}
      <div className="w-56 shrink-0 space-y-2">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Documents</span>
          <Button variant="ghost" size="icon-sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>

        {loading ? (
          <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-10 bg-muted/30 rounded-lg animate-pulse" />)}</div>
        ) : contexts.length === 0 ? (
          <div className="text-center py-6">
            <FileCode className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">No documents yet</p>
            <Button size="xs" variant="outline" className="mt-2" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3 w-3 mr-1" /> Add
            </Button>
          </div>
        ) : (
          contexts.map((ctx: any) => (
            <div
              key={ctx.key}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors group text-sm',
                selectedKey === ctx.key ? 'bg-accent text-foreground' : 'hover:bg-accent/50 text-muted-foreground'
              )}
              onClick={() => selectContext(ctx)}
            >
              <FileCode className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate flex-1 font-medium">{ctx.key}</span>
              <span className="text-[10px] text-muted-foreground">v{ctx.version}</span>
              <Button
                variant="ghost"
                size="icon-sm"
                className="opacity-0 group-hover:opacity-100 h-5 w-5"
                onClick={(e) => { e.stopPropagation(); handleDelete(ctx.key); }}
              >
                <Trash2 className="h-3 w-3 text-destructive" />
              </Button>
            </div>
          ))
        )}
      </div>

      {/* Editor */}
      <div className="flex-1 min-w-0">
        {selectedKey ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-sm">{selectedKey}</h3>
                {currentCtx && (
                  <span className="text-xs text-muted-foreground">v{currentCtx.version}</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button size="xs" variant="outline" onClick={() => fetchVersions(selectedKey)}>
                  <History className="h-3 w-3 mr-1" /> Versions
                </Button>
                <Button size="xs" onClick={handleSave} loading={saving}>
                  <Save className="h-3 w-3 mr-1" /> Save
                </Button>
              </div>
            </div>
            <Textarea
              value={editValue}
              onChange={(e: any) => setEditValue(e.target.value)}
              rows={16}
              className="font-mono text-sm resize-y"
              placeholder="Write markdown content..."
            />

            {/* Version History */}
            {showVersions && (
              <div className="border border-border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">Version History</span>
                  <Button variant="ghost" size="icon-sm" onClick={() => setShowVersions(false)}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
                {versions.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No versions found</p>
                ) : (
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {versions.map((v: any) => (
                      <div
                        key={v.id}
                        className={cn(
                          'flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-xs transition-colors',
                          v.version === currentCtx?.version ? 'bg-accent' : 'hover:bg-accent/50'
                        )}
                        onClick={() => { setEditValue(v.value); }}
                      >
                        <ChevronRight className="h-3 w-3 text-muted-foreground" />
                        <span className="font-medium">v{v.version}</span>
                        <span className="text-muted-foreground flex-1">
                          {v.createdAt ? formatDistanceToNow(new Date(v.createdAt), { addSuffix: true }) : ''}
                        </span>
                        <span className="text-muted-foreground">{v.value.length} chars</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <EmptyState
            icon={FileCode}
            title="Select a document"
            description="Choose a context document from the left panel, or create a new one."
          />
        )}
      </div>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>New Context Document</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            {/* Template Suggestions */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Quick Templates</Label>
              <div className="flex flex-wrap gap-1.5">
                {TEMPLATE_KEYS.filter((t) => !contexts.some((c) => c.key === t.key)).map((t) => (
                  <button
                    key={t.key}
                    onClick={() => handleTemplateSelect(t)}
                    className="text-xs px-2 py-1 rounded-md border border-border hover:bg-accent transition-colors"
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Key</Label>
              <Input placeholder="e.g. brief, tech-stack" value={newKey} onChange={(e: any) => setNewKey(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Content (Markdown)</Label>
              <Textarea
                placeholder="Write markdown content..."
                value={newValue}
                onChange={(e: any) => setNewValue(e.target.value)}
                rows={8}
                className="font-mono text-sm"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate}>Create</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
