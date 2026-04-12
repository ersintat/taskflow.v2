'use client';

import { useEffect, useState, useCallback } from 'react';
import { Settings, Save, FolderOpen, Zap, Loader2, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface ProjectConfig {
  claudeWorkDir: string | null;
  autoMission: boolean;
  connectedApis: string | null;
}

export function ConfigTab({ projectId }: { projectId: string }) {
  const [config, setConfig] = useState<ProjectConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [autoMission, setAutoMission] = useState(false);

  const fetchConfig = useCallback(() => {
    setLoading(true);
    fetch(`/api/projects/${projectId}/config`)
      .then((r) => r.json())
      .then((d: any) => {
        setConfig(d);
        setAutoMission(d.autoMission || false);
      })
      .catch((e) => console.error('[config_tab]', e))
      .finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const saveConfig = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/config`, {
        method: 'PATCH',
        body: JSON.stringify({ autoMission }),
      });
      if (res.ok) {
        toast.success('Configuration saved');
        fetchConfig();
      } else {
        toast.error('Failed to save');
      }
    } catch {
      toast.error('Save error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading config...
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-xl bg-indigo-500/10 flex items-center justify-center">
          <Settings className="h-4.5 w-4.5 text-indigo-500" />
        </div>
        <div>
          <h3 className="text-sm font-semibold">Project Configuration</h3>
          <p className="text-xs text-muted-foreground">Bridge and Orchestrator settings for this project</p>
        </div>
      </div>



      {/* Auto Mission */}
      <div className="border border-border rounded-xl p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-500" />
              <div>
                <Label className="font-semibold text-sm">Auto-Mission</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  When enabled, the Orchestrator can create and send missions to Bridge without asking for your confirmation.
                </p>
              </div>
            </div>
          </div>
          <Switch
            checked={autoMission}
            onCheckedChange={setAutoMission}
          />
        </div>
        {autoMission && (
          <div className="mt-3 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <p className="text-xs text-amber-700 dark:text-amber-400">
              ⚡ The Orchestrator will send missions directly to your Bridge agent without confirmation.
              Make sure your Bridge is running and monitored.
            </p>
          </div>
        )}
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={saveConfig} disabled={saving}>
          {saving ? (
            <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Saving...</>
          ) : (
            <><Save className="h-4 w-4 mr-1.5" /> Save Configuration</>
          )}
        </Button>
      </div>
    </div>
  );
}
