'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Users, Bot, Cpu, User, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { ActorAvatar } from '@/components/shared/actor-avatar';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ACTOR_TYPES, TRUST_LEVELS } from '@/lib/constants';
import { toast } from 'sonner';

export function ActorsClient() {
  const router = useRouter();
  const [actors, setActors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState('HUMAN');
  const [formEmail, setFormEmail] = useState('');
  const [formTrust, setFormTrust] = useState('SUPERVISED');
  const [formCapabilities, setFormCapabilities] = useState('');

  const fetchActors = useCallback(() => {
    fetch('/api/actors')
      .then((r) => r.json())
      .then((d: any) => setActors(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchActors(); }, [fetchActors]);

  const handleCreate = async () => {
    if (!formName.trim()) { toast.error('Name is required'); return; }
    setCreating(true);
    try {
      const caps = formCapabilities
        .split(',')
        .map((c: string) => c.trim())
        .filter(Boolean)
        .map((c: string) => ({ name: c, level: 3 }));

      const res = await fetch('/api/actors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName.trim(),
          type: formType,
          email: formEmail.trim() || null,
          trustLevel: formTrust,
          capabilities: caps,
        }),
      });
      if (!res.ok) { const d = await res.json(); toast.error(d?.error ?? 'Failed'); return; }
      toast.success('Actor created');
      setFormName(''); setFormType('HUMAN'); setFormEmail(''); setFormTrust('SUPERVISED'); setFormCapabilities('');
      setDialogOpen(false);
      fetchActors();
    } catch { toast.error('Something went wrong'); } finally { setCreating(false); }
  };

  const trustBadge = (level: string) => {
    const found = TRUST_LEVELS.find((t: any) => t.value === level);
    return (
      <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', found?.color ?? 'bg-gray-100 text-gray-700')}>
        {found?.label ?? level}
      </span>
    );
  };

  const typeBadge = (type: string) => {
    const colors: Record<string, string> = {
      HUMAN: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
      AGENT: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
      SYSTEM: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
    };
    return (
      <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', colors[type] ?? colors.HUMAN)}>
        {ACTOR_TYPES.find((t: any) => t.value === type)?.label ?? type}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="p-6 max-w-[1200px] mx-auto space-y-4">
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i: number) => <Skeleton key={i} className="h-36 rounded-xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-[1200px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight">Team</h2>
          <p className="text-sm text-muted-foreground mt-1">Manage team members and AI agents</p>
        </div>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />Add Member
        </Button>
      </div>

      {actors.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No members yet"
          description="Add team members and AI agents to assign tasks."
        >
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />Add Member
          </Button>
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {actors.map((actor: any) => (
            <Card key={actor.id} className="border border-border hover:shadow-md transition-shadow cursor-pointer" onClick={() => router.push(`/actors/${actor.id}`)}>
              <CardContent className="p-5">
                <div className="flex items-start gap-3 mb-3">
                  <ActorAvatar name={actor.name} type={actor.type} avatarUrl={actor.avatarUrl} size="lg" />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm truncate">{actor.name}</h3>
                    {actor.email && <p className="text-xs text-muted-foreground truncate">{actor.email}</p>}
                    <div className="flex items-center gap-1.5 mt-1.5">
                      {typeBadge(actor.type)}
                      {trustBadge(actor.trustLevel)}
                    </div>
                  </div>
                </div>
                {(actor.capabilities ?? []).length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {(actor.capabilities ?? []).map((c: any) => (
                      <span key={c.id} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs">
                        <Star className="h-2.5 w-2.5 text-amber-500" />
                        {c.capabilityName}
                      </span>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add Member</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input placeholder="Full name" value={formName} onChange={(e: any) => setFormName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={formType} onValueChange={setFormType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ACTOR_TYPES.map((t: any) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Trust Level</Label>
                <Select value={formTrust} onValueChange={setFormTrust}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TRUST_LEVELS.map((t: any) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {formType === 'HUMAN' && (
              <div className="space-y-2">
                <Label>Email (optional)</Label>
                <Input type="email" placeholder="email@company.com" value={formEmail} onChange={(e: any) => setFormEmail(e.target.value)} />
              </div>
            )}
            <div className="space-y-2">
              <Label>Capabilities (comma-separated)</Label>
              <Input placeholder="e.g. code_review, testing, design" value={formCapabilities} onChange={(e: any) => setFormCapabilities(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} loading={creating}>Add Member</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
