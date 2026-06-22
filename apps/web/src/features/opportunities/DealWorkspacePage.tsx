import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ChevronRight, Lock, ShieldAlert } from 'lucide-react';
import { apiGet, apiPut, apiPost, apiError } from '@/lib/api';
import type { OpportunitiesMeta, QualificationView, Qualification, DealReport } from '@/types/ignite';
import { useAuth } from '@/hooks/useAuth';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toaster';
import { cn } from '@/lib/utils';
import {
  DEMAND_GATE,
  ICP_CRITERIA,
  TIER2,
  TIER3,
  ENTRY_POINT_LABELS,
  SEQUENCE_DAYS,
  VERDICT_TONE,
} from './igniteCopy';
import { ReportView } from './ReportView';
import { NextActionCard } from '@/features/recommendations/recommendations';

type Section = 'ignite' | 'attract' | 'probe' | 'execute' | 'cement' | 'report';
const TABS: { id: Section; label: string }[] = [
  { id: 'ignite', label: 'IGNITE' },
  { id: 'attract', label: 'ATTRACT' },
  { id: 'probe', label: 'PROBE' },
  { id: 'execute', label: 'EXECUTE' },
  { id: 'cement', label: 'CEMENT' },
  { id: 'report', label: 'REPORT' },
];

// Immutable deep-set by path (e.g. ['probe','ladder','pain']).
function deepSet<T>(obj: T, path: (string | number)[], value: unknown): T {
  if (path.length === 0) return value as T;
  const [head, ...rest] = path;
  const src = obj as unknown;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clone: any = Array.isArray(src) ? [...src] : { ...(src as object) };
  clone[head] = deepSet(clone[head], rest, value);
  return clone as T;
}

function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        'min-h-[72px] w-full rounded-md border border-input bg-background p-2 text-sm',
        props.className,
      )}
    />
  );
}

function ScorePill({ label, value, max, ok }: { label: string; value: number; max: number; ok?: boolean }) {
  return (
    <div className="rounded-md border px-3 py-2 text-center">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn('text-lg font-bold', ok ? 'text-green-600' : '')}>
        {value}
        <span className="text-xs font-normal text-muted-foreground">/{max}</span>
      </div>
    </div>
  );
}

export function DealWorkspacePage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const { canWrite, canReassign } = useAuth();
  const [tab, setTab] = useState<Section>('ignite');
  const [draft, setDraft] = useState<Qualification | null>(null);

  const meta = useQuery({ queryKey: ['opp-meta'], queryFn: () => apiGet<OpportunitiesMeta>('/opportunities/meta') });
  const view = useQuery({
    queryKey: ['qualification', id],
    queryFn: () => apiGet<QualificationView>(`/opportunities/${id}/qualification`),
    retry: false,
  });

  useEffect(() => {
    if (view.data?.qualification) setDraft(view.data.qualification);
  }, [view.data]);

  const save = useMutation({
    mutationFn: () => apiPut<QualificationView>(`/opportunities/${id}/qualification`, draft),
    onSuccess: (res) => {
      toast({ title: `Saved — verdict: ${res.verdictLabel}`, variant: 'success' });
      void qc.invalidateQueries({ queryKey: ['qualification', id] });
      void qc.invalidateQueries({ queryKey: ['opportunities'] });
      void qc.invalidateQueries({ queryKey: ['analytics', 'pipeline'] });
    },
    onError: (e) => toast({ title: 'Save failed', description: apiError(e), variant: 'destructive' }),
  });

  const advance = useMutation({
    mutationFn: ({ stage, force }: { stage: string; force?: boolean }) =>
      apiPost(`/opportunities/${id}/stage`, { stage, ...(force ? { forceGate: true } : {}) }),
    onSuccess: (_d, v) => {
      toast({ title: `Advanced to ${v.stage}`, variant: 'success' });
      void qc.invalidateQueries({ queryKey: ['qualification', id] });
      void qc.invalidateQueries({ queryKey: ['opportunities'] });
    },
    onError: (e) => toast({ title: 'Cannot advance', description: apiError(e), variant: 'destructive' }),
  });

  const stages = useMemo(
    () => meta.data?.frameworks.find((f) => f.id === 'ignite_apex')?.stages.filter((s) => s.open) ?? [],
    [meta.data],
  );

  if (view.isLoading || meta.isLoading) return <Skeleton className="h-96" />;

  if (view.isError) {
    return (
      <div className="max-w-xl">
        <Link to="/opportunities" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to pipeline
        </Link>
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            The deal workspace is only available for companies on the <b>IGNITE-APEX</b> framework. Switch your
            framework in Company Settings, or this opportunity could not be loaded.
          </CardContent>
        </Card>
      </div>
    );
  }

  const v = view.data!;
  const d = draft;
  const set = (path: (string | number)[], value: unknown) => d && setDraft(deepSet(d, path, value));
  const currentIdx = stages.findIndex((s) => s.id === v.stage);
  const gateFor = (stage: string) => v.gates.find((g) => g.stage === stage);

  return (
    <div className="pb-16">
      <Link to="/opportunities" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to pipeline
      </Link>
      <PageHeader title={v.opportunity.name} description="IGNITE-APEX deal workspace" />

      {/* Verdict + scores header */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-6">
        <div className="col-span-2 flex flex-col justify-center rounded-md border p-3 sm:col-span-1">
          <div className="text-xs text-muted-foreground">Verdict</div>
          <span
            className={cn(
              'mt-1 inline-block w-fit rounded border px-2 py-0.5 text-xs font-semibold',
              VERDICT_TONE[v.verdict] ?? 'bg-zinc-100 text-zinc-700',
            )}
          >
            {v.verdictLabel}
          </span>
        </div>
        <ScorePill label="Demand Gate" value={v.scores.t1} max={5} ok={v.scores.t1 >= 4} />
        <ScorePill label="ICP" value={v.scores.icp} max={100} ok={v.scores.icp >= 70} />
        <ScorePill label="Qualifier" value={v.scores.t2} max={10} ok={v.scores.t2 === 10} />
        <ScorePill label="Commit Gate" value={v.scores.t3} max={5} ok={v.scores.t3 === 5} />
        <ScorePill label="CEMENT" value={v.cement.pct} max={100} ok={v.cement.pct === 100} />
      </div>

      {/* Stage stepper */}
      <Card className="mb-5">
        <CardContent className="flex flex-wrap items-center gap-2 pt-6">
          {stages.map((s, i) => {
            const gate = gateFor(s.id);
            const isCurrent = s.id === v.stage;
            const isNext = i === currentIdx + 1;
            const blocked = gate && !gate.ok;
            return (
              <div key={s.id} className="flex items-center gap-2">
                <div
                  className={cn(
                    'rounded-md border px-3 py-1.5 text-xs font-medium',
                    isCurrent ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground',
                  )}
                  title={blocked ? gate?.reason : gate?.requirement}
                >
                  {s.label}
                  {blocked && <Lock className="ml-1 inline h-3 w-3" />}
                </div>
                {isNext && canWrite && (
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant={blocked ? 'outline' : 'default'}
                      disabled={advance.isPending || (blocked && !canReassign)}
                      onClick={() => advance.mutate({ stage: s.id, force: blocked ? true : false })}
                      title={blocked ? `${gate?.reason} — managers can override` : `Advance to ${s.label}`}
                    >
                      {blocked ? <ShieldAlert className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      {blocked ? 'Override' : 'Advance'}
                    </Button>
                  </div>
                )}
                {i < stages.length - 1 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* AI next-best-action */}
      <NextActionCard opportunityId={id} />

      {/* Tabs */}
      <div className="mb-4 flex flex-wrap gap-1 border-b">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'px-4 py-2 text-sm font-medium',
              tab === t.id ? 'border-b-2 border-primary text-foreground' : 'text-muted-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {d && tab !== 'report' && (
        <div className="space-y-5">
          {tab === 'ignite' && <IgniteTab d={d} set={set} entryPoints={meta.data?.entryPoints ?? []} />}
          {tab === 'attract' && <AttractTab d={d} set={set} />}
          {tab === 'probe' && <ProbeTab d={d} set={set} />}
          {tab === 'execute' && <ExecuteTab d={d} set={set} />}
          {tab === 'cement' && <CementTab d={d} set={set} layers={meta.data?.cementLayers ?? []} />}
          {canWrite && (
            <div className="sticky bottom-4 flex justify-end">
              <Button onClick={() => save.mutate()} disabled={save.isPending}>
                Save qualification
              </Button>
            </div>
          )}
        </div>
      )}

      {tab === 'report' && <ReportView opportunityId={id} />}
    </div>
  );
}

// ── Tabs ────────────────────────────────────────────────────────────────────
type TabProps = { d: Qualification; set: (path: (string | number)[], value: unknown) => void };

function Check({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-2 text-sm">
      <input type="checkbox" className="mt-0.5" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function GateRows({
  items,
  store,
  base,
  set,
}: {
  items: { key: string; label: string; help?: string }[];
  store: Record<string, { pass: boolean; evidence: string }>;
  base: (string | number)[];
  set: TabProps['set'];
}) {
  return (
    <div className="space-y-3">
      {items.map((it) => {
        const cell = store[it.key] ?? { pass: false, evidence: '' };
        return (
          <div key={it.key} className="rounded-md border p-3">
            <Check checked={cell.pass} onChange={(val) => set([...base, it.key, 'pass'], val)} label={it.label} />
            {it.help && <p className="ml-6 mt-0.5 text-xs text-muted-foreground">{it.help}</p>}
            <Input
              className="mt-2"
              placeholder="Evidence (required to count)…"
              value={cell.evidence}
              onChange={(e) => set([...base, it.key, 'evidence'], e.target.value)}
            />
          </div>
        );
      })}
    </div>
  );
}

function IgniteTab({ d, set, entryPoints }: TabProps & { entryPoints: string[] }) {
  const ig = d.ignite;
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Identify — trigger & mindset</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Check checked={ig.mindsetMissionary} onChange={(v) => set(['ignite', 'mindsetMissionary'], v)} label="Missionary over Mercenary" />
          <Check checked={ig.mindsetIcpConfirmed} onChange={(v) => set(['ignite', 'mindsetIcpConfirmed'], v)} label="ICP confirmed before first contact" />
          <div>
            <Label>Trigger event (≥30 chars — never contact without one)</Label>
            <Textarea value={ig.trigger} onChange={(e) => set(['ignite', 'trigger'], e.target.value)} />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Go Deep — research</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {([
            ['strategicPriorities', 'Strategic priorities'],
            ['individual', 'The individual'],
            ['competitivePressure', 'Competitive pressure'],
            ['peerReference', 'Peer reference / proof'],
          ] as const).map(([k, lbl]) => (
            <div key={k}>
              <Label>{lbl}</Label>
              <Textarea
                value={(ig.research as Record<string, string>)[k] ?? ''}
                onChange={(e) => set(['ignite', 'research', k], e.target.value)}
              />
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Nail the Insight</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Check checked={ig.educationWeapon} onChange={(v) => set(['ignite', 'educationWeapon'], v)} label="Education as primary weapon" />
          <div>
            <Label>Reframe opener (≥40 chars, no product mention)</Label>
            <Textarea value={ig.reframeOpener} onChange={(e) => set(['ignite', 'reframeOpener'], e.target.value)} />
          </div>
          <div>
            <Label>Entry point</Label>
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={ig.entryPoint ?? ''}
              onChange={(e) => set(['ignite', 'entryPoint'], e.target.value || null)}
            >
              <option value="">— select —</option>
              {entryPoints.map((ep) => (
                <option key={ep} value={ep}>
                  {ENTRY_POINT_LABELS[ep] ?? ep}
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Initiate — 9-day sequence</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {SEQUENCE_DAYS.map((day) => (
            <Check
              key={day.key}
              checked={(ig.sequence as Record<string, { done: boolean }>)[day.key]?.done ?? false}
              onChange={(v) => set(['ignite', 'sequence', day.key, 'done'], v)}
              label={day.label}
            />
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Escalate — conviction</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Conviction signal (exact words + date)</Label>
            <Textarea value={ig.convictionSignal} onChange={(e) => set(['ignite', 'convictionSignal'], e.target.value)} />
          </div>
          <div>
            <Label>Escalation ask</Label>
            <Textarea value={ig.escalationAsk} onChange={(e) => set(['ignite', 'escalationAsk'], e.target.value)} />
          </div>
        </CardContent>
      </Card>
    </>
  );
}

function AttractTab({ d, set }: TabProps) {
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Tier-1 Demand Gate (need ≥4/5)</CardTitle>
        </CardHeader>
        <CardContent>
          <GateRows items={DEMAND_GATE} store={d.attract.demandGate} base={['attract', 'demandGate']} set={set} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>ICP Scoring Matrix (need ≥70/100)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {ICP_CRITERIA.map((c) => (
            <div key={c.key} className="flex items-center gap-3">
              <Label className="w-44 shrink-0">{c.label}</Label>
              <input
                type="range"
                min={0}
                max={20}
                value={(d.attract.icp as Record<string, number>)[c.key] ?? 0}
                onChange={(e) => set(['attract', 'icp', c.key], Number(e.target.value))}
                className="flex-1"
              />
              <span className="w-10 text-right text-sm font-medium">
                {(d.attract.icp as Record<string, number>)[c.key] ?? 0}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
}

function ProbeTab({ d, set }: TabProps) {
  const p = d.probe;
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>3-Layer Root Cause</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Layer 1 — Symptom (their words)</Label>
            <Textarea value={p.rootCause.l1Symptom} onChange={(e) => set(['probe', 'rootCause', 'l1Symptom'], e.target.value)} />
          </div>
          <div>
            <Label>Layer 2 — Structural cause</Label>
            <Textarea value={p.rootCause.l2Structural} onChange={(e) => set(['probe', 'rootCause', 'l2Structural'], e.target.value)} />
          </div>
          <div>
            <Label>Layer 3 — Root cause (their EXACT words — never paraphrase)</Label>
            <Textarea value={p.rootCause.l3Root} onChange={(e) => set(['probe', 'rootCause', 'l3Root'], e.target.value)} />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Pain → Impact → ROI</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Pain</Label>
            <Textarea value={p.ladder.pain} onChange={(e) => set(['probe', 'ladder', 'pain'], e.target.value)} />
          </div>
          <div>
            <Label>Impact (quantified $ / hours)</Label>
            <Textarea value={p.ladder.impact} onChange={(e) => set(['probe', 'ladder', 'impact'], e.target.value)} />
          </div>
          <div>
            <Label>ROI (year-one value they stated)</Label>
            <Textarea value={p.ladder.roi} onChange={(e) => set(['probe', 'ladder', 'roi'], e.target.value)} />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Champion vs Veto Player</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Champion name</Label>
            <Input value={p.champion.name} onChange={(e) => set(['probe', 'champion', 'name'], e.target.value)} />
          </div>
          <div>
            <Label>Champion role</Label>
            <Input value={p.champion.role} onChange={(e) => set(['probe', 'champion', 'role'], e.target.value)} />
          </div>
          <div>
            <Label>Veto player name</Label>
            <Input value={p.veto.name} onChange={(e) => set(['probe', 'veto', 'name'], e.target.value)} />
          </div>
          <div>
            <Label>Veto concern → mitigation</Label>
            <Input value={p.veto.mitigation} onChange={(e) => set(['probe', 'veto', 'mitigation'], e.target.value)} />
          </div>
        </CardContent>
      </Card>
    </>
  );
}

function ExecuteTab({ d, set }: TabProps) {
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Tier-2 Opportunity Qualifier (10 — need ≥5 to unlock Tier-3)</CardTitle>
        </CardHeader>
        <CardContent>
          <GateRows items={TIER2} store={d.execute.tier2} base={['execute', 'tier2']} set={set} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Tier-3 Forecast Commit Gate (all 5 must pass to COMMIT)</CardTitle>
        </CardHeader>
        <CardContent>
          <GateRows items={TIER3} store={d.execute.tier3} base={['execute', 'tier3']} set={set} />
        </CardContent>
      </Card>
    </>
  );
}

function CementTab({
  d,
  set,
  layers,
}: TabProps & { layers: { key: string; label: string; months: string; actions: { key: string; label: string }[] }[] }) {
  return (
    <>
      <p className="text-sm text-muted-foreground">
        Post-sale architecture — work these layers across months 1–36 to protect and expand the account.
      </p>
      {layers.map((layer) => (
        <Card key={layer.key}>
          <CardHeader>
            <CardTitle className="text-base">
              {layer.label} <span className="text-xs font-normal text-muted-foreground">· months {layer.months}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {layer.actions.map((a) => (
              <Check
                key={a.key}
                checked={(d.cement as Record<string, Record<string, boolean>>)[layer.key]?.[a.key] ?? false}
                onChange={(v) => set(['cement', layer.key, a.key], v)}
                label={a.label}
              />
            ))}
          </CardContent>
        </Card>
      ))}
    </>
  );
}
