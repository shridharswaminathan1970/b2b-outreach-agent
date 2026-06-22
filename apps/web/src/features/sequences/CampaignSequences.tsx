import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Pencil } from 'lucide-react';
import { apiList, apiGet, apiPost, apiPut, apiDelete, apiError } from '@/lib/api';
import type { Sequence, SequenceStep } from '@/types/api';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from '@/components/ui/toaster';
import { SequenceWizard } from './SequenceWizard';

const CHANNELS = ['email', 'linkedin', 'call', 'task'];
const OPS_INTEL_TOUCHES = 5; // touches 1..5 must be ops_intel + signature_only

interface EditableStep {
  channel: string;
  delayHours: number;
  intent: string;
  branding: string;
  subject: string;
}

function toEditable(s: SequenceStep): EditableStep {
  return { channel: s.channel, delayHours: s.delayHours, intent: s.intent, branding: s.branding, subject: s.subject ?? '' };
}

function StepsDialog({ sequenceId, onClose }: { sequenceId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['sequence', sequenceId],
    queryFn: () => apiGet<{ sequence: Sequence }>(`/sequences/${sequenceId}`),
  });
  const [steps, setSteps] = useState<EditableStep[]>([]);

  useEffect(() => {
    if (data?.sequence.steps) setSteps(data.sequence.steps.map(toEditable));
  }, [data]);

  // Touches 1..5 are constrained to operational-intelligence / signature-only.
  function normalize(list: EditableStep[]): EditableStep[] {
    return list.map((s, i) =>
      i < OPS_INTEL_TOUCHES ? { ...s, intent: 'ops_intel', branding: 'signature_only' } : s,
    );
  }
  function update(i: number, patch: Partial<EditableStep>) {
    setSteps((prev) => normalize(prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s))));
  }
  function addStep() {
    setSteps((prev) =>
      normalize([
        ...prev,
        { channel: 'email', delayHours: prev.length ? 96 : 0, intent: 'soft_positioning', branding: 'inline', subject: '' },
      ]),
    );
  }
  function removeStep(i: number) {
    setSteps((prev) => normalize(prev.filter((_, idx) => idx !== i)));
  }

  const save = useMutation({
    // PUT replaces the full ordered step list (validated against the demand-gen
    // framework server-side).
    mutationFn: () => apiPut(`/sequences/${sequenceId}/steps`, { steps }),
    onSuccess: () => {
      toast({ title: 'Steps saved', variant: 'success' });
      void qc.invalidateQueries({ queryKey: ['sequence', sequenceId] });
      void qc.invalidateQueries({ queryKey: ['sequences'] });
      onClose();
    },
    onError: (e) => toast({ title: 'Save failed', description: apiError(e), variant: 'destructive' }),
  });

  return (
    <DialogContent className="max-w-3xl">
      <DialogHeader>
        <DialogTitle>Sequence steps</DialogTitle>
      </DialogHeader>
      <p className="text-xs text-muted-foreground">
        Demand-gen framework: touches 1–{OPS_INTEL_TOUCHES} deliver operational intelligence only (zero sales intent),
        with eMOBIQ AI in the signature. Soft positioning is allowed from touch {OPS_INTEL_TOUCHES + 1}.
      </p>

      {isLoading ? (
        <Skeleton className="h-40" />
      ) : (
        <div className="max-h-[55vh] space-y-2 overflow-auto">
          {steps.map((s, i) => {
            const locked = i < OPS_INTEL_TOUCHES;
            return (
              <div key={i} className="grid grid-cols-12 items-center gap-2 rounded-md border p-2">
                <div className="col-span-1 text-center text-sm font-semibold">{i + 1}</div>
                <select
                  className="col-span-2 h-8 rounded-md border border-input bg-background px-2 text-xs"
                  value={s.channel}
                  onChange={(e) => update(i, { channel: e.target.value })}
                >
                  {CHANNELS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <div className="col-span-2 flex items-center gap-1">
                  <Input
                    type="number"
                    className="h-8 text-xs"
                    value={s.delayHours}
                    onChange={(e) => update(i, { delayHours: Number(e.target.value) })}
                  />
                  <span className="text-xs text-muted-foreground">h</span>
                </div>
                <select
                  className="col-span-2 h-8 rounded-md border border-input bg-background px-2 text-xs disabled:opacity-60"
                  value={s.intent}
                  disabled={locked}
                  onChange={(e) => update(i, { intent: e.target.value })}
                >
                  <option value="ops_intel">ops_intel</option>
                  <option value="soft_positioning">soft_positioning</option>
                </select>
                <select
                  className="col-span-2 h-8 rounded-md border border-input bg-background px-2 text-xs disabled:opacity-60"
                  value={s.branding}
                  disabled={locked}
                  onChange={(e) => update(i, { branding: e.target.value })}
                >
                  <option value="signature_only">signature_only</option>
                  <option value="inline">inline</option>
                </select>
                <Input
                  className="col-span-2 h-8 text-xs"
                  placeholder="Subject"
                  value={s.subject}
                  onChange={(e) => update(i, { subject: e.target.value })}
                />
                <button className="col-span-1 text-muted-foreground hover:text-destructive" onClick={() => removeStep(i)}>
                  <Trash2 className="mx-auto h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <Button variant="outline" size="sm" onClick={addStep} className="w-fit">
        <Plus className="h-4 w-4" /> Add step
      </Button>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          Save steps
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

export function CampaignSequences({ campaignId }: { campaignId: string }) {
  const { canWrite } = useAuth();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['sequences', campaignId],
    queryFn: () => apiList<Sequence>('/sequences', { params: { campaignId, limit: 50 } }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiDelete(`/sequences/${id}`),
    onSuccess: () => {
      toast({ title: 'Sequence deleted', variant: 'success' });
      void qc.invalidateQueries({ queryKey: ['sequences', campaignId] });
    },
    onError: (e) => toast({ title: 'Delete failed', description: apiError(e), variant: 'destructive' }),
  });

  return (
    <Card className="mt-6">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Sequences</CardTitle>
        {canWrite && (
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4" /> New sequence
              </Button>
            </DialogTrigger>
            {createOpen && <SequenceWizard campaignId={campaignId} onDone={() => setCreateOpen(false)} />}
          </Dialog>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-20" />
        ) : !data?.items.length ? (
          <p className="text-sm text-muted-foreground">No sequences yet.</p>
        ) : (
          <div className="space-y-2">
            {data.items.map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <div className="font-medium">{s.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {s._count?.steps ?? s.totalSteps} steps · <Badge variant="muted">{s.status}</Badge>
                  </div>
                </div>
                {canWrite && (
                  <div className="flex gap-1">
                    <Dialog open={editing === s.id} onOpenChange={(o) => setEditing(o ? s.id : null)}>
                      <DialogTrigger asChild>
                        <Button size="sm" variant="outline">
                          <Pencil className="h-4 w-4" /> Steps
                        </Button>
                      </DialogTrigger>
                      {editing === s.id && <StepsDialog sequenceId={s.id} onClose={() => setEditing(null)} />}
                    </Dialog>
                    <Button size="sm" variant="ghost" onClick={() => remove.mutate(s.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
