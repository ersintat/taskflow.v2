'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Search,
  Plus,
  BookOpen,
  Lightbulb,
  FileText,
  Cog,
  Link2,
  HelpCircle,
  Trash2,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

const KNOWLEDGE_TYPES = [
  { value: 'LESSON_LEARNED', label: 'Lesson Learned', icon: Lightbulb, color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  { value: 'DECISION_RATIONALE', label: 'Decision Rationale', icon: FileText, color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  { value: 'TECHNICAL_NOTE', label: 'Technical Note', icon: Cog, color: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300' },
  { value: 'PROCESS_NOTE', label: 'Process Note', icon: BookOpen, color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  { value: 'REFERENCE', label: 'Reference', icon: Link2, color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300' },
  { value: 'FAQ', label: 'FAQ', icon: HelpCircle, color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300' },
] as const;

interface Props {
  projectId: string;
}

export function KnowledgeTab({ projectId }: Props) {
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<any>(null);

  // Create form
  const [formTitle, setFormTitle] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formType, setFormType] = useState('LESSON_LEARNED');
  const [formTags, setFormTags] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchEntries = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (searchQuery) params.set('query', searchQuery);
    if (filterType) params.set('type', filterType);
    fetch(`/api/projects/${projectId}/knowledge?${params}`)
      .then((r) => r.json())
      .then((d: any) => setEntries(Array.isArray(d) ? d : []))
      .catch((e) => console.error('[knowledge_tab]', e))
      .finally(() => setLoading(false));
  }, [projectId, searchQuery, filterType]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  const handleCreate = async () => {
    if (!formTitle.trim() || !formContent.trim()) { toast.error('Title and content are required'); return; }
    setCreating(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/knowledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: formTitle.trim(),
          content: formContent.trim(),
          type: formType,
          tags: formTags.split(',').map((t) => t.trim()).filter(Boolean),
        }),
      });
      if (!res.ok) { toast.error('Failed to create'); return; }
      toast.success('Knowledge entry created');
      setFormTitle(''); setFormContent(''); setFormType('LESSON_LEARNED'); setFormTags('');
      setCreateOpen(false);
      fetchEntries();
    } catch { toast.error('Something went wrong'); } finally { setCreating(false); }
  };

  const handleDelete = async (entryId: string) => {
    try {
      await fetch(`/api/projects/${projectId}/knowledge/${entryId}`, { method: 'DELETE' });
      toast.success('Entry deleted');
      setSelectedEntry(null);
      fetchEntries();
    } catch { toast.error('Failed to delete'); }
  };

  const getTypeConfig = (type: string) => KNOWLEDGE_TYPES.find((t) => t.value === type) ?? KNOWLEDGE_TYPES[0];

  return (
    <div className="space-y-4">
      {/* Search + Filter + Create */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search knowledge base..."
            value={searchQuery}
            onChange={(e: any) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="All Types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">All Types</SelectItem>
            {KNOWLEDGE_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Entry
        </Button>
      </div>

      {/* Entries Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 bg-muted/30 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No knowledge entries"
          description="Start building your project's knowledge base by adding lessons learned, decisions, and notes."
        >
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Add Entry
          </Button>
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {entries.map((entry: any) => {
            const cfg = getTypeConfig(entry.type);
            const Icon = cfg.icon;
            return (
              <div
                key={entry.id}
                className="p-4 border border-border rounded-xl hover:bg-accent/30 transition-colors cursor-pointer space-y-2"
                onClick={() => setSelectedEntry(entry)}
              >
                <div className="flex items-start gap-2">
                  <div className={cn('p-1.5 rounded-md shrink-0', cfg.color)}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="font-medium text-sm truncate">{entry.title}</h4>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{entry.content}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded', cfg.color)}>
                    {cfg.label}
                  </span>
                  {(Array.isArray(entry.tags) ? entry.tags : (() => { try { return JSON.parse(entry.tags || '[]'); } catch { return []; } })()).slice(0, 3).map((tag: string) => (
                    <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{tag}</span>
                  ))}
                  <span className="text-[10px] text-muted-foreground ml-auto">
                    {entry.createdAt ? formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true }) : ''}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detail View */}
      {selectedEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setSelectedEntry(null)}>
          <div className="bg-card border border-border rounded-xl w-full max-w-lg max-h-[80vh] overflow-y-auto p-6 space-y-4 mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                {(() => { const cfg = getTypeConfig(selectedEntry.type); const Icon = cfg.icon; return (
                  <div className={cn('p-1.5 rounded-md', cfg.color)}><Icon className="h-4 w-4" /></div>
                ); })()}
                <h3 className="font-semibold text-lg">{selectedEntry.title}</h3>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon-sm" onClick={() => handleDelete(selectedEntry.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
                <Button variant="ghost" size="icon-sm" onClick={() => setSelectedEntry(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="text-sm text-muted-foreground whitespace-pre-wrap">{selectedEntry.content}</div>
            <div className="flex items-center gap-2 flex-wrap">
              {(() => { const cfg = getTypeConfig(selectedEntry.type); return (
                <span className={cn('text-xs font-medium px-2 py-0.5 rounded', cfg.color)}>{cfg.label}</span>
              ); })()}
              {(Array.isArray(selectedEntry.tags) ? selectedEntry.tags : (() => { try { return JSON.parse(selectedEntry.tags || '[]'); } catch { return []; } })()).map((tag: string) => (
                <span key={tag} className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">{tag}</span>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Created {selectedEntry.createdAt ? formatDistanceToNow(new Date(selectedEntry.createdAt), { addSuffix: true }) : ''}
            </p>
          </div>
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add Knowledge Entry</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input placeholder="Entry title" value={formTitle} onChange={(e: any) => setFormTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={formType} onValueChange={setFormType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {KNOWLEDGE_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Content</Label>
              <Textarea placeholder="Write your knowledge entry..." value={formContent} onChange={(e: any) => setFormContent(e.target.value)} rows={5} />
            </div>
            <div className="space-y-2">
              <Label>Tags (comma-separated)</Label>
              <Input placeholder="e.g. seo, performance, shopify" value={formTags} onChange={(e: any) => setFormTags(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} loading={creating}>Create</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
