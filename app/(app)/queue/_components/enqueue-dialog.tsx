'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

export function EnqueueDialog({ open, onOpenChange, onCreated }: Props) {
  const [tasks, setTasks] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [projectId, setProjectId] = useState('');
  const [taskId, setTaskId] = useState('');
  const [priority, setPriority] = useState('5');
  const [budgetCents, setBudgetCents] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Fetch projects on open
  useEffect(() => {
    if (open) {
      fetch('/api/projects').then((r) => r.json()).then((d: any) => setProjects(Array.isArray(d) ? d : [])).catch((e) => console.error('[enqueue_dialog]', e));
    }
  }, [open]);

  // Fetch tasks when project selected
  useEffect(() => {
    if (projectId) {
      fetch(`/api/projects/${projectId}`)
        .then((r) => r.json())
        .then((d: any) => {
          const projectTasks = d?.tasks ?? [];
          // Only show tasks that are not done/cancelled
          setTasks(projectTasks.filter((t: any) => !['done', 'cancelled'].includes(t.status)));
        })
        .catch(() => setTasks([]));
    } else {
      setTasks([]);
    }
    setTaskId('');
  }, [projectId]);

  const handleSubmit = async () => {
    if (!taskId) { toast.error('Please select a task'); return; }
    setSubmitting(true);
    try {
      const res = await fetch('/api/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId,
          priority: parseInt(priority) || 5,
          budgetCents: budgetCents ? parseInt(budgetCents) : null,
        }),
      });
      if (!res.ok) { const d = await res.json(); toast.error(d?.error ?? 'Failed'); return; }
      toast.success('Task enqueued for agent processing');
      setProjectId(''); setTaskId(''); setPriority('5'); setBudgetCents('');
      onOpenChange(false);
      onCreated();
    } catch { toast.error('Something went wrong'); } finally { setSubmitting(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Enqueue Task for Agent</DialogTitle></DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label>Project</Label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger><SelectValue placeholder="Select a project" /></SelectTrigger>
              <SelectContent>
                {projects.map((p: any) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Task</Label>
            <Select value={taskId} onValueChange={setTaskId} disabled={!projectId}>
              <SelectTrigger><SelectValue placeholder={projectId ? 'Select a task' : 'Select project first'} /></SelectTrigger>
              <SelectContent>
                {tasks.map((t: any) => (
                  <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Priority (0–10)</Label>
              <Input
                type="number"
                min={0}
                max={10}
                value={priority}
                onChange={(e: any) => setPriority(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Budget (cents, optional)</Label>
              <Input
                type="number"
                min={0}
                placeholder="e.g. 500"
                value={budgetCents}
                onChange={(e: any) => setBudgetCents(e.target.value)}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleSubmit} loading={submitting}>Enqueue</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
