'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  project: { id: string; name: string; description: string | null };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: () => void;
}

export function EditProjectDialog({ project, open, onOpenChange, onUpdated }: Props) {
  const router = useRouter();
  const [name, setName] = useState(project?.name ?? '');
  const [description, setDescription] = useState(project?.description ?? '');
  const [saving, setSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (open) {
      setName(project?.name ?? '');
      setDescription(project?.description ?? '');
      setShowDeleteConfirm(false);
      setDeleteConfirmText('');
    }
  }, [open, project]);

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), description: description.trim() || null }),
      });
      if (!res.ok) { toast.error('Failed to update'); return; }
      toast.success('Project updated');
      onOpenChange(false);
      onUpdated();
    } catch { toast.error('Something went wrong'); } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (deleteConfirmText !== project.name) {
      toast.error('Project name does not match');
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch(`/api/projects/${project.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || 'Failed to delete');
        return;
      }
      toast.success(`Project "${project.name}" deleted`);
      onOpenChange(false);
      router.push('/projects');
    } catch { toast.error('Something went wrong'); } finally { setDeleting(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit Project</DialogTitle></DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={name} onChange={(e: any) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea value={description} onChange={(e: any) => setDescription(e.target.value)} rows={3} />
          </div>
          <div className="flex justify-between items-center pt-4 border-t">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowDeleteConfirm(!showDeleteConfirm)}
              className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
            >
              <Trash2 className="h-4 w-4 mr-1.5" />
              Delete Project
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={handleSave} loading={saving}>Save</Button>
            </div>
          </div>

          {showDeleteConfirm && (
            <div className="rounded-md border border-red-500/30 bg-red-500/5 p-4 space-y-3">
              <div className="text-sm space-y-1">
                <p className="font-semibold text-red-500">⚠️ This action cannot be undone</p>
                <p className="text-muted-foreground text-xs">
                  All tasks, chat history, knowledge base entries, context, missions, schedules, and logs
                  associated with this project will be permanently deleted.
                </p>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">
                  Type <span className="font-mono font-semibold">{project.name}</span> to confirm
                </Label>
                <Input
                  value={deleteConfirmText}
                  onChange={(e: any) => setDeleteConfirmText(e.target.value)}
                  placeholder={project.name}
                  autoFocus
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText(''); }}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleDelete}
                  loading={deleting}
                  disabled={deleteConfirmText !== project.name}
                  className="bg-red-500 hover:bg-red-600 text-white"
                >
                  Delete Permanently
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
