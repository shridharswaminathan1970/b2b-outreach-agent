import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronLeft, ChevronRight, Plus, Trash2, Rocket, Search, Users, Calendar } from 'lucide-react';
import { apiList, apiPost, apiError } from '@/lib/api';
import type { Contact } from '@/types/api';
import { DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toaster';
import { cn } from '@/lib/utils';

const CHANNELS = ['email', 'linkedin', 'call', 'task'];
const OPS_INTEL_TOUCHES = 5; // touches 1..5 → ops_intel + signature_only (framework)

interface EditableStep {
  channel: string;
  delayHours: number;
  intent: string;
  branding: string;
  subject: string;
}

const STEPS_META = [
  { id: 1, label: 'Compose', icon: Plus },
  { id: 2, label: 'Audience', icon: Users },
  { id: 3, label: 'Schedule', icon: Calendar },
  { id: 4, label: 'Review', icon: Rocket },
];

// Touches 1..5 are locked to operational-intelligence / signature-only branding.
function normalize(list: EditableStep[]): EditableStep[] {
  return list.map((s, i) =>
    i < OPS_INTEL_TOUCHES ? { ...s, intent: 'ops_intel', branding: 'signature_only' } : s,
  );
}

export function SequenceWizard({
  campaignId,
  onDone,
}: {
  campaignId: string;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const [step, setStep] = useState(1);

  // Step 1 — Compose
  const [name, setName] = useState('');
  const [steps, setSteps] = useState<EditableStep[]>([
    { channel: 'email', delayHours: 0, intent: 'ops_intel', branding: 'signature_only', subject: '' },
  ]);

  // Step 2 — Audience
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Record<string, Contact>>({});

  // Step 3 — Schedule
  const [startMode, setStartMode] = useState<'now' | 'scheduled'>('now');
  const [startAt, setStartAt] = useState('');

  const contacts = useQuery({
    queryKey: ['contacts', 'wizard', search],
    queryFn: () => apiList<Contact>('/contacts', { params: { limit: 50, ...(search ? { search } : {}) } }),
    enabled: step === 2,
  });

  const selectedList = useMemo(() => Object.values(selected), [selected]);

  function updateStep(i: number, patch: Partial<EditableStep>) {
    setSteps((prev) => normalize(prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s))));
  }
  function addStep() {
    setSteps((prev) =>
      normalize([
        ...prev,
        {
          channel: 'email',
          delayHours: prev.length ? 96 : 0,
          intent: prev.length >= OPS_INTEL_TOUCHES ? 'soft_positioning' : 'ops_intel',
          branding: prev.length >= OPS_INTEL_TOUCHES ? 'inline' : 'signature_only',
          subject: '',
        },
      ]),
    );
  }
  function removeStep(i: number) {
    setSteps((prev) => normalize(prev.filter((_, idx) => idx !== i)));
  }
  function toggleContact(c: Contact) {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[c.id]) delete next[c.id];
      else next[c.id] = c;
      return next;
    });
  }

  // Activate = create sequence → enroll audience → activate campaign.
  const activate = useMutation({
    mutationFn: async () => {
      const created = await apiPost<{ sequence: { id: string } }>('/sequences', {
        campaignId,
        name,
        steps: steps.map((s) => ({
          channel: s.channel,
          delayHours: s.delayHours,
          intent: s.intent,
          branding: s.branding,
          subject: s.subject || null,
        })),
      });
      const sequenceId = created.sequence.id;
      const enrollRes = await apiPost<{ enrolled: number; skippedAlreadyEnrolled: number; skippedOutOfScopeOrSuppressed: number }>(
        `/sequences/${sequenceId}/enroll`,
        {
          contactIds: selectedList.map((c) => c.id),
          ...(startMode === 'scheduled' && startAt ? { startAt: new Date(startAt).toISOString() } : {}),
        },
      );
      // Best-effort campaign activation; a paused/active campaign is fine.
      await apiPost(`/campaigns/${campaignId}/activate`, {}).catch(() => undefined);
      return enrollRes;
    },
    onSuccess: (res) => {
      toast({
        title: 'Sequence activated',
        description: `${res.enrolled} contact(s) enrolled${res.skippedOutOfScopeOrSuppressed ? `, ${res.skippedOutOfScopeOrSuppressed} skipped` : ''}.`,
        variant: 'success',
      });
      void qc.invalidateQueries({ queryKey: ['sequences', campaignId] });
      void qc.invalidateQueries({ queryKey: ['campaign', campaignId] });
      onDone();
    },
    onError: (e) => toast({ title: 'Activation failed', description: apiError(e), variant: 'destructive' }),
  });

  // Per-step gate for the Continue button.
  const canContinue =
    step === 1
      ? name.trim().length > 0 && steps.length > 0
      : step === 2
        ? selectedList.length > 0
        : step === 3
          ? startMode === 'now' || Boolean(startAt)
          : true;

  return (
    <DialogContent className="max-w-3xl">
      <DialogHeader>
        <DialogTitle>New sequence</DialogTitle>
      </DialogHeader>

      {/* Stepper */}
      <div className="flex items-center justify-between px-2">
        {STEPS_META.map((s, i) => {
          const state = step === s.id ? 'current' : step > s.id ? 'done' : 'todo';
          return (
            <div key={s.id} className="flex flex-1 items-center">
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full border text-sm font-semibold',
                    state === 'current' && 'border-primary bg-primary text-primary-foreground',
                    state === 'done' && 'border-primary bg-primary/10 text-primary',
                    state === 'todo' && 'border-input text-muted-foreground',
                  )}
                >
                  {state === 'done' ? <Check className="h-4 w-4" /> : s.id}
                </div>
                <span className={cn('mt-1 text-xs', state === 'todo' ? 'text-muted-foreground' : 'text-foreground')}>
                  {s.label}
                </span>
              </div>
              {i < STEPS_META.length - 1 && (
                <div className={cn('mx-2 h-0.5 flex-1', step > s.id ? 'bg-primary' : 'bg-border')} />
              )}
            </div>
          );
        })}
      </div>

      <div className="max-h-[55vh] overflow-auto px-1 py-2">
        {step === 1 && (
          <ComposeStep
            name={name}
            setName={setName}
            steps={steps}
            updateStep={updateStep}
            addStep={addStep}
            removeStep={removeStep}
          />
        )}
        {step === 2 && (
          <AudienceStep
            search={search}
            setSearch={setSearch}
            contacts={contacts.data?.items ?? []}
            loading={contacts.isLoading}
            selected={selected}
            toggle={toggleContact}
            selectedCount={selectedList.length}
          />
        )}
        {step === 3 && (
          <ScheduleStep startMode={startMode} setStartMode={setStartMode} startAt={startAt} setStartAt={setStartAt} />
        )}
        {step === 4 && (
          <ReviewStep
            name={name}
            steps={steps}
            audienceCount={selectedList.length}
            startMode={startMode}
            startAt={startAt}
          />
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t pt-3">
        <Button variant="outline" onClick={() => setStep((s) => Math.max(1, s - 1))} disabled={step === 1}>
          <ChevronLeft className="h-4 w-4" /> Back
        </Button>
        {step < 4 ? (
          <Button onClick={() => setStep((s) => Math.min(4, s + 1))} disabled={!canContinue}>
            Continue <ChevronRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button onClick={() => activate.mutate()} disabled={activate.isPending}>
            <Rocket className="h-4 w-4" /> Activate sequence
          </Button>
        )}
      </div>
    </DialogContent>
  );
}

// ── Step 1 — Compose ──────────────────────────────────────────────────────────
function ComposeStep({
  name,
  setName,
  steps,
  updateStep,
  addStep,
  removeStep,
}: {
  name: string;
  setName: (v: string) => void;
  steps: EditableStep[];
  updateStep: (i: number, patch: Partial<EditableStep>) => void;
  addStep: () => void;
  removeStep: (i: number) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>Sequence name</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="9-Touch Demand Gen" />
      </div>
      <p className="text-xs text-muted-foreground">
        Touches 1–{OPS_INTEL_TOUCHES} deliver operational intelligence only (zero sales intent), vendor in the
        signature. Soft positioning unlocks at touch {OPS_INTEL_TOUCHES + 1}.
      </p>
      <div className="space-y-2">
        {steps.map((s, i) => {
          const locked = i < OPS_INTEL_TOUCHES;
          return (
            <div key={i} className="grid grid-cols-12 items-center gap-2 rounded-md border p-2">
              <div className="col-span-1 text-center text-sm font-semibold">{i + 1}</div>
              <select
                className="col-span-2 h-8 rounded-md border border-input bg-background px-2 text-xs"
                value={s.channel}
                onChange={(e) => updateStep(i, { channel: e.target.value })}
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
                  onChange={(e) => updateStep(i, { delayHours: Number(e.target.value) })}
                />
                <span className="text-xs text-muted-foreground">h</span>
              </div>
              <select
                className="col-span-2 h-8 rounded-md border border-input bg-background px-2 text-xs disabled:opacity-60"
                value={s.intent}
                disabled={locked}
                onChange={(e) => updateStep(i, { intent: e.target.value })}
              >
                <option value="ops_intel">ops_intel</option>
                <option value="soft_positioning">soft_positioning</option>
              </select>
              <Input
                className="col-span-2 h-8 text-xs"
                placeholder="Subject"
                value={s.subject}
                onChange={(e) => updateStep(i, { subject: e.target.value })}
              />
              <div className="col-span-1 text-center">
                {locked && <Badge variant="muted">🔒</Badge>}
              </div>
              <button
                className="col-span-1 text-muted-foreground hover:text-destructive"
                onClick={() => removeStep(i)}
                disabled={steps.length === 1}
              >
                <Trash2 className="mx-auto h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
      <Button variant="outline" size="sm" onClick={addStep} className="w-fit">
        <Plus className="h-4 w-4" /> Add touch
      </Button>
    </div>
  );
}

// ── Step 2 — Audience ─────────────────────────────────────────────────────────
function AudienceStep({
  search,
  setSearch,
  contacts,
  loading,
  selected,
  toggle,
  selectedCount,
}: {
  search: string;
  setSearch: (v: string) => void;
  contacts: Contact[];
  loading: boolean;
  selected: Record<string, Contact>;
  toggle: (c: Contact) => void;
  selectedCount: number;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="relative w-72">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search contacts…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Badge variant="muted">{selectedCount} selected</Badge>
      </div>
      {loading ? (
        <Skeleton className="h-48" />
      ) : contacts.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No contacts found.</p>
      ) : (
        <div className="divide-y rounded-md border">
          {contacts.map((c) => {
            const isSel = Boolean(selected[c.id]);
            return (
              <label
                key={c.id}
                className={cn('flex cursor-pointer items-center gap-3 p-2.5 text-sm', isSel && 'bg-primary/5')}
              >
                <input type="checkbox" checked={isSel} onChange={() => toggle(c)} disabled={c.suppressed} />
                <div className="flex-1">
                  <div className="font-medium">{c.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {c.title ?? '—'} {c.account?.name ? `· ${c.account.name}` : ''} {c.email ? `· ${c.email}` : ''}
                  </div>
                </div>
                {c.suppressed && <Badge variant="muted">suppressed</Badge>}
                <Badge variant="muted">ICP {c.icpScore}</Badge>
              </label>
            );
          })}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Suppressed contacts can't be enrolled. Contacts already active in this sequence are skipped automatically.
      </p>
    </div>
  );
}

// ── Step 3 — Schedule ─────────────────────────────────────────────────────────
function ScheduleStep({
  startMode,
  setStartMode,
  startAt,
  setStartAt,
}: {
  startMode: 'now' | 'scheduled';
  setStartMode: (v: 'now' | 'scheduled') => void;
  startAt: string;
  setStartAt: (v: string) => void;
}) {
  return (
    <div className="space-y-3">
      <Label>When should the first touch send?</Label>
      <label className={cn('flex cursor-pointer items-start gap-3 rounded-md border p-3', startMode === 'now' && 'border-primary bg-primary/5')}>
        <input type="radio" className="mt-1" checked={startMode === 'now'} onChange={() => setStartMode('now')} />
        <div>
          <div className="text-sm font-medium">Start now</div>
          <div className="text-xs text-muted-foreground">Touch 1 becomes due immediately; the worker picks it up on its next run.</div>
        </div>
      </label>
      <label className={cn('flex cursor-pointer items-start gap-3 rounded-md border p-3', startMode === 'scheduled' && 'border-primary bg-primary/5')}>
        <input type="radio" className="mt-1" checked={startMode === 'scheduled'} onChange={() => setStartMode('scheduled')} />
        <div className="flex-1">
          <div className="text-sm font-medium">Schedule a start time</div>
          <div className="text-xs text-muted-foreground">Hold all enrollments until this time.</div>
          {startMode === 'scheduled' && (
            <Input
              type="datetime-local"
              className="mt-2 w-64"
              value={startAt}
              onChange={(e) => setStartAt(e.target.value)}
            />
          )}
        </div>
      </label>
      <p className="text-xs text-muted-foreground">
        Subsequent touches follow each step's delay (hours) after the previous send.
      </p>
    </div>
  );
}

// ── Step 4 — Review ───────────────────────────────────────────────────────────
function ReviewStep({
  name,
  steps,
  audienceCount,
  startMode,
  startAt,
}: {
  name: string;
  steps: EditableStep[];
  audienceCount: number;
  startMode: 'now' | 'scheduled';
  startAt: string;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-md border p-3">
        <div className="text-xs font-semibold uppercase text-muted-foreground">Sequence</div>
        <div className="font-medium">{name || '—'}</div>
        <div className="text-sm text-muted-foreground">{steps.length} touch(es)</div>
        <ol className="mt-2 space-y-1 text-xs text-muted-foreground">
          {steps.map((s, i) => (
            <li key={i}>
              {i + 1}. {s.channel} · +{s.delayHours}h · {s.intent}
              {s.subject ? ` · "${s.subject}"` : ''}
            </li>
          ))}
        </ol>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-md border p-3">
          <div className="text-xs font-semibold uppercase text-muted-foreground">Audience</div>
          <div className="text-2xl font-bold">{audienceCount}</div>
          <div className="text-xs text-muted-foreground">contact(s) to enroll</div>
        </div>
        <div className="rounded-md border p-3">
          <div className="text-xs font-semibold uppercase text-muted-foreground">Schedule</div>
          <div className="text-sm font-medium">
            {startMode === 'now' ? 'Start now' : startAt ? new Date(startAt).toLocaleString() : 'Scheduled'}
          </div>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Activating creates the sequence, enrolls the audience, and activates the campaign. Drafts are generated for
        approval — nothing sends without review.
      </p>
    </div>
  );
}
