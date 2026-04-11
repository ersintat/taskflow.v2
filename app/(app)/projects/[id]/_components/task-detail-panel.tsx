'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  X,
  Calendar,
  Tag,
  AlertTriangle,
  Clock,
  Activity,
  UserPlus,
  Trash2,
  CheckCircle2,
  XCircle,
  ArrowRight,
  Gavel,
  MessageSquare,
  ListChecks,
  Send,
  Reply,
  MoreHorizontal,
  Pencil,
  Plus,
  GripVertical,
  Square,
  CheckSquare,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatusBadge } from '@/components/shared/status-badge';
import { PriorityBadge } from '@/components/shared/priority-dot';
import { ActorAvatar } from '@/components/shared/actor-avatar';
import { TASK_STATUSES, TASK_PRIORITIES, TASK_TYPES, PLATFORMS, EVENT_TYPE_LABELS } from '@/lib/constants';
import { PlatformBadge } from '@/components/shared/platform-badge';
import { toast } from 'sonner';
import { formatDistanceToNow, format } from 'date-fns';

interface Props {
  taskId: string;
  onClose: () => void;
  onUpdate: () => void;
}

export function TaskDetailPanel({ taskId, onClose, onUpdate }: Props) {
  const [task, setTask] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actors, setActors] = useState<any[]>([]);
  const [assignActorId, setAssignActorId] = useState('');
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState('');
  const [decisions, setDecisions] = useState<any[]>([]);
  const [decisionTitle, setDecisionTitle] = useState('');
  const [decisionText, setDecisionText] = useState('');
  const [decisionRationale, setDecisionRationale] = useState('');
  const [decidingType, setDecidingType] = useState<string | null>(null);

  // Comments state
  const [comments, setComments] = useState<any[]>([]);
  const [commentText, setCommentText] = useState('');
  const [commentActorId, setCommentActorId] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editCommentText, setEditCommentText] = useState('');
  const commentInputRef = useRef<HTMLTextAreaElement>(null);

  // Subtasks state
  const [subtasks, setSubtasks] = useState<any[]>([]);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [editingSubtaskId, setEditingSubtaskId] = useState<string | null>(null);
  const [editSubtaskTitle, setEditSubtaskTitle] = useState('');

  const fetchTask = useCallback(() => {
    setLoading(true);
    fetch(`/api/tasks/${taskId}`)
      .then((r) => r.json())
      .then((d: any) => setTask(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [taskId]);

  const fetchDecisions = useCallback(() => {
    fetch(`/api/tasks/${taskId}/decide`)
      .then((r) => r.json())
      .then((d: any) => setDecisions(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, [taskId]);

  const fetchComments = useCallback(() => {
    fetch(`/api/tasks/${taskId}/comments`)
      .then((r) => r.json())
      .then((d: any) => setComments(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, [taskId]);

  const fetchSubtasks = useCallback(() => {
    fetch(`/api/tasks/${taskId}/subtasks`)
      .then((r) => r.json())
      .then((d: any) => setSubtasks(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, [taskId]);

  useEffect(() => {
    fetchTask();
    fetchDecisions();
    fetchComments();
    fetchSubtasks();
    fetch('/api/actors').then((r) => r.json()).then((d: any) => setActors(Array.isArray(d) ? d : [])).catch(() => {});
  }, [fetchTask, fetchDecisions, fetchComments, fetchSubtasks]);

  const patchTask = async (field: string, value: any) => {
    try {
      await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      });
      fetchTask();
      onUpdate();
    } catch { toast.error('Failed to update'); }
  };

  const handleAssign = async () => {
    if (!assignActorId) return;
    try {
      await fetch(`/api/tasks/${taskId}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actorId: assignActorId }),
      });
      setAssignActorId('');
      fetchTask();
      onUpdate();
      toast.success('Actor assigned');
    } catch { toast.error('Failed to assign'); }
  };

  const handleUnassign = async (actorId: string) => {
    try {
      await fetch(`/api/tasks/${taskId}/assign?actorId=${actorId}`, { method: 'DELETE' });
      fetchTask();
      onUpdate();
    } catch { toast.error('Failed to unassign'); }
  };

  const quickApprove = async () => {
    try {
      const res = await fetch(`/api/tasks/${taskId}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decisionType: 'APPROVAL',
          title: 'Approved',
          decision: 'Work approved.',
        }),
      });
      if (!res.ok) { toast.error('Failed to approve'); return; }
      toast.success('Task approved');
      setDecidingType(null);
      fetchTask();
      onUpdate();
    } catch { toast.error('Failed to approve'); }
  };

  const submitDecision = async (type: string) => {
    if (!decisionText.trim()) {
      toast.error('Decision details are required');
      return;
    }
    try {
      const res = await fetch(`/api/tasks/${taskId}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decisionType: type,
          title: type === 'REJECTION' ? 'Rejected' : 'Redirected',
          decision: decisionText.trim(),
          rationale: decisionRationale.trim() || null,
        }),
      });
      if (!res.ok) { const d = await res.json(); toast.error(d?.error ?? 'Failed'); return; }
      toast.success(`Decision recorded: ${type}`);
      setDecisionTitle(''); setDecisionText(''); setDecisionRationale(''); setDecidingType(null);
      fetchTask();
      fetchDecisions();
      onUpdate();
    } catch { toast.error('Failed to submit decision'); }
  };

  // ── Comment handlers ──
  const postComment = async (parentId?: string) => {
    const text = parentId ? replyText : commentText;
    const actId = commentActorId || actors[0]?.id;
    if (!text.trim() || !actId) {
      toast.error('Select an actor and enter a comment');
      return;
    }
    try {
      const res = await fetch(`/api/tasks/${taskId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text.trim(), actorId: actId, parentId: parentId || null }),
      });
      if (!res.ok) { const d = await res.json(); toast.error(d?.error ?? 'Failed'); return; }
      if (parentId) { setReplyTo(null); setReplyText(''); } else { setCommentText(''); }
      fetchComments();
    } catch { toast.error('Failed to post comment'); }
  };

  const updateComment = async (commentId: string) => {
    if (!editCommentText.trim()) return;
    try {
      await fetch(`/api/tasks/${taskId}/comments/${commentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editCommentText.trim() }),
      });
      setEditingCommentId(null);
      setEditCommentText('');
      fetchComments();
    } catch { toast.error('Failed to update'); }
  };

  const deleteComment = async (commentId: string) => {
    try {
      await fetch(`/api/tasks/${taskId}/comments/${commentId}`, { method: 'DELETE' });
      fetchComments();
    } catch { toast.error('Failed to delete'); }
  };

  // ── Subtask handlers ──
  const addSubtask = async () => {
    if (!newSubtaskTitle.trim()) return;
    try {
      await fetch(`/api/tasks/${taskId}/subtasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newSubtaskTitle.trim() }),
      });
      setNewSubtaskTitle('');
      fetchSubtasks();
    } catch { toast.error('Failed to add subtask'); }
  };

  const toggleSubtask = async (subtaskId: string, completed: boolean) => {
    try {
      await fetch(`/api/tasks/${taskId}/subtasks/${subtaskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed }),
      });
      fetchSubtasks();
    } catch { toast.error('Failed to update'); }
  };

  const updateSubtask = async (subtaskId: string) => {
    if (!editSubtaskTitle.trim()) return;
    try {
      await fetch(`/api/tasks/${taskId}/subtasks/${subtaskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editSubtaskTitle.trim() }),
      });
      setEditingSubtaskId(null);
      setEditSubtaskTitle('');
      fetchSubtasks();
    } catch { toast.error('Failed to update'); }
  };

  const deleteSubtask = async (subtaskId: string) => {
    try {
      await fetch(`/api/tasks/${taskId}/subtasks/${subtaskId}`, { method: 'DELETE' });
      fetchSubtasks();
    } catch { toast.error('Failed to delete'); }
  };

  const completedCount = subtasks.filter((s: any) => s.completed).length;

  const saveDescription = async () => {
    await patchTask('description', descDraft || null);
    setEditingDesc(false);
  };

  if (loading) {
    return (
      <div className="w-[520px] border-l border-border bg-card shrink-0 p-6 space-y-4 overflow-y-auto">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!task) return null;

  const assignments = task.assignments ?? [];
  const activities = task.activities ?? [];
  const assignedIds = new Set(assignments.map((a: any) => a.actorId));
  const unassignedActors = actors.filter((a: any) => !assignedIds.has(a.id));

  return (
    <div className="w-[520px] border-l border-border bg-card shrink-0 flex flex-col overflow-hidden max-h-full">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 p-4 border-b border-border shrink-0">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-base truncate">{task.title}</h3>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <StatusBadge status={task.status} />
            <PriorityBadge priority={task.priority} />
            {task.platform && <PlatformBadge platform={task.platform} />}
          </div>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Pending Review Banner */}
      {['pending_review', 'pending_acceptance'].includes(task.status) && (
        <div className="mx-4 mt-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
          <span className="text-sm font-medium text-amber-600 dark:text-amber-400">Sub-agent çalışmasını tamamladı — onay bekliyor</span>
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue={['pending_review', 'pending_acceptance'].includes(task.status) ? 'decisions' : 'details'} className="flex-1 flex flex-col overflow-hidden">
        <TabsList className="w-full justify-start rounded-none border-b border-border bg-transparent px-4 h-10 shrink-0">
          <TabsTrigger value="details" className="text-xs">Details</TabsTrigger>
          <TabsTrigger value="subtasks" className="text-xs">
            Subtasks{subtasks.length > 0 && ` (${completedCount}/${subtasks.length})`}
          </TabsTrigger>
          <TabsTrigger value="comments" className="text-xs">
            Comments{comments.length > 0 && ` (${comments.length})`}
          </TabsTrigger>
          <TabsTrigger value="decisions" className="text-xs">Decisions</TabsTrigger>
          <TabsTrigger value="activity" className="text-xs">Activity</TabsTrigger>
        </TabsList>

        {/* Details Tab */}
        <TabsContent value="details" className="flex-1 overflow-y-auto p-4 space-y-5 m-0">
          {/* Description */}
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">Description</Label>
            {editingDesc ? (
              <div className="space-y-2">
                <Textarea value={descDraft} onChange={(e: any) => setDescDraft(e.target.value)} rows={3} />
                <div className="flex gap-2">
                  <Button size="xs" onClick={saveDescription}>Save</Button>
                  <Button size="xs" variant="ghost" onClick={() => setEditingDesc(false)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <div
                onClick={() => { setDescDraft(task.description ?? ''); setEditingDesc(true); }}
                className="text-sm text-muted-foreground cursor-pointer hover:bg-accent/50 rounded-lg p-2 min-h-[40px] transition-colors"
              >
                {task.description || 'Click to add a description...'}
              </div>
            )}
          </div>

          {/* Metadata Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Status</Label>
              <Select value={task.status} onValueChange={(v: string) => patchTask('status', v)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TASK_STATUSES.map((s: any) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Priority</Label>
              <Select value={task.priority} onValueChange={(v: string) => patchTask('priority', v)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TASK_PRIORITIES.map((p: any) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Type</Label>
              <Select value={task.taskType} onValueChange={(v: string) => patchTask('taskType', v)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TASK_TYPES.map((t: any) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Platform</Label>
              <Select value={task.platform ?? '_none'} onValueChange={(v: string) => patchTask('platform', v === '_none' ? null : v)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">None</SelectItem>
                  {PLATFORMS.map((p: any) => (
                    <SelectItem key={p.value} value={p.value}>
                      <span className="flex items-center gap-2">
                        <span className={`inline-block w-2 h-2 rounded-full ${p.dotColor}`} />
                        {p.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Due Date</Label>
              <Input
                type="date"
                className="h-8 text-xs"
                value={task.dueDate ? format(new Date(task.dueDate), 'yyyy-MM-dd') : ''}
                onChange={(e: any) => patchTask('dueDate', e.target.value || null)}
              />
            </div>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block flex items-center gap-1">
              <Clock className="h-3 w-3" /> Created
            </Label>
            <p className="text-xs text-muted-foreground">
              {task.createdAt ? format(new Date(task.createdAt), 'MMM d, yyyy h:mm a') : 'Unknown'}
            </p>
          </div>

          {/* Assigned Actors */}
          <div>
            <Label className="text-xs text-muted-foreground mb-2 block">Assigned</Label>
            <div className="space-y-2">
              {assignments.length === 0 && (
                <p className="text-xs text-muted-foreground">No one assigned yet</p>
              )}
              {assignments.map((a: any) => (
                <div key={a.id} className="flex items-center gap-2.5 group">
                  <ActorAvatar name={a.actor?.name ?? '?'} type={a.actor?.type ?? 'HUMAN'} avatarUrl={a.actor?.avatarUrl} size="sm" />
                  <span className="text-sm flex-1">{a.actor?.name ?? 'Unknown'}</span>
                  <span className="text-xs text-muted-foreground">{a.role}</span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6"
                    onClick={() => handleUnassign(a.actorId)}
                  >
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              ))}
              {unassignedActors.length > 0 && (
                <div className="flex items-center gap-2 pt-1">
                  <Select value={assignActorId} onValueChange={setAssignActorId}>
                    <SelectTrigger className="h-8 text-xs flex-1"><SelectValue placeholder="Assign actor..." /></SelectTrigger>
                    <SelectContent>
                      {unassignedActors.map((a: any) => (
                        <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button size="xs" onClick={handleAssign} disabled={!assignActorId}>
                    <UserPlus className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* Subtasks Tab */}
        <TabsContent value="subtasks" className="flex-1 overflow-y-auto p-4 space-y-4 m-0">
          {/* Progress */}
          {subtasks.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{completedCount} of {subtasks.length} done</span>
                <span>{subtasks.length > 0 ? Math.round((completedCount / subtasks.length) * 100) : 0}%</span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                  style={{ width: `${subtasks.length > 0 ? (completedCount / subtasks.length) * 100 : 0}%` }}
                />
              </div>
            </div>
          )}

          {/* Add subtask */}
          <div className="flex items-center gap-2">
            <Input
              placeholder="Add a subtask..."
              value={newSubtaskTitle}
              onChange={(e: any) => setNewSubtaskTitle(e.target.value)}
              onKeyDown={(e: any) => e.key === 'Enter' && addSubtask()}
              className="text-sm h-8 flex-1"
            />
            <Button size="xs" onClick={addSubtask} disabled={!newSubtaskTitle.trim()}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Subtask list */}
          {subtasks.length === 0 ? (
            <div className="text-center py-8">
              <ListChecks className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No subtasks yet</p>
              <p className="text-xs text-muted-foreground mt-1">Break this task into smaller steps</p>
            </div>
          ) : (
            <div className="space-y-1">
              {subtasks.map((st: any) => (
                <div key={st.id} className="flex items-center gap-2 group rounded-lg hover:bg-accent/50 px-2 py-1.5 transition-colors">
                  <button
                    onClick={() => toggleSubtask(st.id, !st.completed)}
                    className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {st.completed ? (
                      <CheckSquare className="h-4 w-4 text-indigo-500" />
                    ) : (
                      <Square className="h-4 w-4" />
                    )}
                  </button>
                  {editingSubtaskId === st.id ? (
                    <div className="flex-1 flex items-center gap-2">
                      <Input
                        value={editSubtaskTitle}
                        onChange={(e: any) => setEditSubtaskTitle(e.target.value)}
                        onKeyDown={(e: any) => e.key === 'Enter' && updateSubtask(st.id)}
                        className="text-sm h-7 flex-1"
                        autoFocus
                      />
                      <Button size="xs" variant="ghost" onClick={() => updateSubtask(st.id)}>Save</Button>
                      <Button size="xs" variant="ghost" onClick={() => setEditingSubtaskId(null)}>✕</Button>
                    </div>
                  ) : (
                    <>
                      <span className={cn('text-sm flex-1', st.completed && 'line-through text-muted-foreground')}>
                        {st.title}
                      </span>
                      <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-opacity">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="h-6 w-6"
                          onClick={() => { setEditingSubtaskId(st.id); setEditSubtaskTitle(st.title); }}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="h-6 w-6 text-destructive"
                          onClick={() => deleteSubtask(st.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Comments Tab */}
        <TabsContent value="comments" className="flex-1 flex flex-col overflow-hidden m-0">
          {/* Comment list */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {comments.length === 0 ? (
              <div className="text-center py-8">
                <MessageSquare className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No comments yet</p>
                <p className="text-xs text-muted-foreground mt-1">Start a conversation about this task</p>
              </div>
            ) : (
              comments.map((c: any) => (
                <div key={c.id} className="space-y-3">
                  {/* Top-level comment */}
                  <div className="group">
                    <div className="flex items-start gap-2.5">
                      <ActorAvatar name={c.actor?.name ?? '?'} type={c.actor?.type ?? 'HUMAN'} avatarUrl={c.actor?.avatarUrl} size="sm" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{c.actor?.name ?? 'Unknown'}</span>
                          <span className="text-xs text-muted-foreground">
                            {c.createdAt ? formatDistanceToNow(new Date(c.createdAt), { addSuffix: true }) : ''}
                          </span>
                        </div>
                        {editingCommentId === c.id ? (
                          <div className="mt-1 space-y-2">
                            <Textarea
                              value={editCommentText}
                              onChange={(e: any) => setEditCommentText(e.target.value)}
                              rows={2}
                              className="text-sm"
                              autoFocus
                            />
                            <div className="flex gap-2">
                              <Button size="xs" onClick={() => updateComment(c.id)}>Save</Button>
                              <Button size="xs" variant="ghost" onClick={() => setEditingCommentId(null)}>Cancel</Button>
                            </div>
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground mt-0.5 whitespace-pre-wrap">{c.content}</p>
                        )}
                        {editingCommentId !== c.id && (
                          <div className="flex items-center gap-2 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => { setReplyTo(c.id); setReplyText(''); }}
                              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                            >
                              <Reply className="h-3 w-3" /> Reply
                            </button>
                            <button
                              onClick={() => { setEditingCommentId(c.id); setEditCommentText(c.content); }}
                              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                            >
                              <Pencil className="h-3 w-3" /> Edit
                            </button>
                            <button
                              onClick={() => deleteComment(c.id)}
                              className="text-xs text-destructive hover:text-destructive/80 flex items-center gap-1"
                            >
                              <Trash2 className="h-3 w-3" /> Delete
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Replies */}
                  {c.replies?.length > 0 && (
                    <div className="ml-8 space-y-3 border-l-2 border-border pl-3">
                      {c.replies.map((r: any) => (
                        <div key={r.id} className="group/reply">
                          <div className="flex items-start gap-2">
                            <ActorAvatar name={r.actor?.name ?? '?'} type={r.actor?.type ?? 'HUMAN'} avatarUrl={r.actor?.avatarUrl} size="sm" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">{r.actor?.name ?? 'Unknown'}</span>
                                <span className="text-xs text-muted-foreground">
                                  {r.createdAt ? formatDistanceToNow(new Date(r.createdAt), { addSuffix: true }) : ''}
                                </span>
                              </div>
                              {editingCommentId === r.id ? (
                                <div className="mt-1 space-y-2">
                                  <Textarea
                                    value={editCommentText}
                                    onChange={(e: any) => setEditCommentText(e.target.value)}
                                    rows={2}
                                    className="text-sm"
                                    autoFocus
                                  />
                                  <div className="flex gap-2">
                                    <Button size="xs" onClick={() => updateComment(r.id)}>Save</Button>
                                    <Button size="xs" variant="ghost" onClick={() => setEditingCommentId(null)}>Cancel</Button>
                                  </div>
                                </div>
                              ) : (
                                <p className="text-sm text-muted-foreground mt-0.5 whitespace-pre-wrap">{r.content}</p>
                              )}
                              {editingCommentId !== r.id && (
                                <div className="flex items-center gap-2 mt-1 opacity-0 group-hover/reply:opacity-100 transition-opacity">
                                  <button
                                    onClick={() => { setEditingCommentId(r.id); setEditCommentText(r.content); }}
                                    className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                                  >
                                    <Pencil className="h-3 w-3" /> Edit
                                  </button>
                                  <button
                                    onClick={() => deleteComment(r.id)}
                                    className="text-xs text-destructive hover:text-destructive/80 flex items-center gap-1"
                                  >
                                    <Trash2 className="h-3 w-3" /> Delete
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Reply input */}
                  {replyTo === c.id && (
                    <div className="ml-8 flex items-start gap-2">
                      <Textarea
                        placeholder="Write a reply..."
                        value={replyText}
                        onChange={(e: any) => setReplyText(e.target.value)}
                        rows={2}
                        className="text-sm flex-1"
                        autoFocus
                      />
                      <div className="flex flex-col gap-1">
                        <Button size="xs" onClick={() => postComment(c.id)} disabled={!replyText.trim()}>
                          <Send className="h-3 w-3" />
                        </Button>
                        <Button size="xs" variant="ghost" onClick={() => setReplyTo(null)}>✕</Button>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Comment input area */}
          <div className="shrink-0 border-t border-border p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Select value={commentActorId || actors[0]?.id || ''} onValueChange={setCommentActorId}>
                <SelectTrigger className="h-7 text-xs w-[140px]"><SelectValue placeholder="As..." /></SelectTrigger>
                <SelectContent>
                  {actors.map((a: any) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-start gap-2">
              <Textarea
                ref={commentInputRef}
                placeholder="Write a comment..."
                value={commentText}
                onChange={(e: any) => setCommentText(e.target.value)}
                onKeyDown={(e: any) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) postComment(); }}
                rows={2}
                className="text-sm flex-1 resize-none"
              />
              <Button size="sm" onClick={() => postComment()} disabled={!commentText.trim()} className="shrink-0 mt-0.5">
                <Send className="h-3.5 w-3.5" />
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">Press Ctrl+Enter to send</p>
          </div>
        </TabsContent>

        {/* Decisions Tab */}
        <TabsContent value="decisions" className="flex-1 overflow-y-auto p-4 space-y-5 m-0">
          {/* Action Buttons for pending_review / pending_acceptance */}
          {['pending_review', 'pending_acceptance'].includes(task.status) && !decidingType && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground font-medium">Bu görev onayınızı bekliyor:</p>
              <div className="flex gap-2">
                <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={quickApprove}>
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" /> Onayla
                </Button>
                <Button size="sm" variant="destructive" onClick={() => setDecidingType('REJECTION')}>
                  <XCircle className="h-3.5 w-3.5 mr-1.5" /> Reddet
                </Button>
                <Button size="sm" variant="outline" onClick={() => setDecidingType('REDIRECT')}>
                  <ArrowRight className="h-3.5 w-3.5 mr-1.5" /> Yönlendir
                </Button>
              </div>
            </div>
          )}

          {/* Decision Form */}
          {decidingType && (
            <div className="space-y-3 p-3 rounded-lg border border-border bg-accent/30">
              <div className="flex items-center justify-between">
                <span className={cn(
                  'text-xs font-semibold px-2 py-0.5 rounded-md',
                  decidingType === 'APPROVAL' && 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
                  decidingType === 'REJECTION' && 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
                  decidingType === 'REDIRECT' && 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
                )}>
                  {decidingType}
                </span>
                <Button size="xs" variant="ghost" onClick={() => setDecidingType(null)}>Cancel</Button>
              </div>
              <div className="space-y-2">
                <Textarea
                  placeholder={decidingType === 'REJECTION' ? "Neyi düzeltmeli? Eksik olan ne?" : "Nereye yönlendirilmeli?"}
                  value={decisionText}
                  onChange={(e: any) => setDecisionText(e.target.value)}
                  rows={2}
                  className="text-sm"
                />
                <Button size="sm" onClick={() => submitDecision(decidingType)}>{decidingType === 'REJECTION' ? 'Reddet' : 'Yönlendir'}</Button>
              </div>
            </div>
          )}

          {/* Also allow decisions even when not in review status */}
          {!['pending_review', 'pending_acceptance'].includes(task.status) && !decidingType && (
            <Button size="sm" variant="outline" onClick={() => setDecidingType('APPROVAL')}>
              <Gavel className="h-3.5 w-3.5 mr-1.5" /> Record Decision
            </Button>
          )}

          {/* Decision History */}
          {decisions.length === 0 ? (
            <div className="text-center py-6">
              <Gavel className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No decisions yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground font-medium">Decision History</p>
              {decisions.map((d: any) => (
                <div key={d.id} className="p-3 rounded-lg border border-border space-y-2">
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      'text-[10px] font-semibold px-1.5 py-0.5 rounded',
                      d.decisionType === 'APPROVAL' && 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
                      d.decisionType === 'REJECTION' && 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
                      d.decisionType === 'REDIRECT' && 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
                      !['APPROVAL', 'REJECTION', 'REDIRECT'].includes(d.decisionType) && 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
                    )}>
                      {d.decisionType}
                    </span>
                    <span className="text-sm font-medium flex-1">{d.title}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{d.decision}</p>
                  {d.rationale && (
                    <p className="text-xs text-muted-foreground italic border-l-2 border-border pl-2">
                      {d.rationale}
                    </p>
                  )}
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {d.actor && <ActorAvatar name={d.actor.name} type={d.actor.type} avatarUrl={d.actor.avatarUrl} size="sm" />}
                    <span>{d.actor?.name ?? 'Unknown'}</span>
                    <span>·</span>
                    <span>{d.createdAt ? formatDistanceToNow(new Date(d.createdAt), { addSuffix: true }) : ''}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Activity Tab */}
        <TabsContent value="activity" className="flex-1 overflow-y-auto p-4 m-0">
          {activities.length === 0 ? (
            <div className="text-center py-8">
              <Activity className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No activity yet</p>
            </div>
          ) : (
            <div className="space-y-0">
              {activities.map((a: any, i: number) => (
                <div key={a.id} className="flex gap-3 pb-4 relative">
                  {i < activities.length - 1 && (
                    <div className="absolute left-[11px] top-7 bottom-0 w-px bg-border" />
                  )}
                  {a.actor ? (
                    <ActorAvatar name={a.actor?.name ?? '?'} type={a.actor?.type ?? 'HUMAN'} avatarUrl={a.actor?.avatarUrl} size="sm" />
                  ) : (
                    <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center shrink-0">
                      <Activity className="h-3 w-3 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">
                      <span className="font-medium">{a.actor?.name ?? 'System'}</span>{' '}
                      <span className="text-muted-foreground">{EVENT_TYPE_LABELS[a.eventType] ?? a.eventType}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">{a.description}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {a.createdAt ? formatDistanceToNow(new Date(a.createdAt), { addSuffix: true }) : ''}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
