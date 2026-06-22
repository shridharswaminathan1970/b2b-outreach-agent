import { useQuery } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import { apiGet } from '@/lib/api';
import type { DealReport } from '@/types/ignite';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { VERDICT_TONE } from './igniteCopy';
import { cn } from '@/lib/utils';

function GateList({ rows }: { rows: { label: string; pass: boolean; evidence: string }[] }) {
  return (
    <ul className="space-y-1 text-sm">
      {rows.map((r, i) => (
        <li key={i} className="flex items-start gap-2">
          <span className={r.pass ? 'text-green-600' : 'text-zinc-300'}>{r.pass ? '✓' : '○'}</span>
          <span>
            {r.label}
            {r.evidence && <span className="text-muted-foreground"> — {r.evidence}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function ReportView({ opportunityId }: { opportunityId: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['deal-report', opportunityId],
    queryFn: () => apiGet<{ report: DealReport }>(`/opportunities/${opportunityId}/report`),
    retry: false,
  });

  if (isLoading) return <Skeleton className="h-96" />;
  if (isError || !data) return <Card><CardContent className="pt-6 text-sm text-muted-foreground">Report unavailable.</CardContent></Card>;

  const r = data.report;
  const es = r.executiveSummary;

  return (
    <div className="space-y-5 print:space-y-3">
      <div className="flex items-center justify-between print:hidden">
        <p className="text-sm text-muted-foreground">Generated {new Date(r.generatedAt).toLocaleString()}</p>
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> Print / PDF
        </Button>
      </div>

      {/* 1 — Executive summary */}
      <Card>
        <CardHeader>
          <CardTitle>1 · Executive summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ['Verdict', es.verdictLabel],
              ['Amount', es.amount != null ? `${es.currency} ${es.amount.toLocaleString()}` : '—'],
              ['Probability', `${es.probability}%`],
              ['CEMENT', `${es.cementPct}%`],
            ].map(([l, val]) => (
              <div key={l} className="rounded-md border p-2 text-center">
                <div className="text-xs text-muted-foreground">{l}</div>
                <div className="font-semibold">{val}</div>
              </div>
            ))}
          </div>
          <span className={cn('inline-block rounded border px-2 py-0.5 text-xs font-semibold', VERDICT_TONE[es.verdict])}>
            {es.verdictLabel}
          </span>
          <p className="mt-2 text-sm text-muted-foreground">
            {es.company ?? '—'} · {es.contact ?? '—'} · owner {es.owner ?? '—'} · stage {es.stage} ·
            T1 {es.scores.t1}/5 · ICP {es.scores.icp}/100 · T2 {es.scores.t2}/10 · T3 {es.scores.t3}/5
          </p>
        </CardContent>
      </Card>

      {/* 4 — PROBE diagnosis */}
      <Card>
        <CardHeader>
          <CardTitle>4 · Diagnosis (root cause → ROI)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p><b>Symptom:</b> {r.probe.rootCause.l1Symptom || '—'}</p>
          <p><b>Structural:</b> {r.probe.rootCause.l2Structural || '—'}</p>
          <p><b>Root cause:</b> {r.probe.rootCause.l3Root || '—'}</p>
          <p className="pt-1"><b>Pain:</b> {r.probe.ladder.pain || '—'} · <b>Impact:</b> {r.probe.ladder.impact || '—'} · <b>ROI:</b> {r.probe.ladder.roi || '—'}</p>
          <p><b>Champion:</b> {r.probe.champion.name || '—'} {r.probe.champion.role && `(${r.probe.champion.role})`}</p>
        </CardContent>
      </Card>

      {/* 5 — Qualification system */}
      <Card>
        <CardHeader>
          <CardTitle>5 · Qualification (20 questions)</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Tier 1 · {r.qualification.scores.t1}/5</p>
            <GateList rows={r.qualification.tier1} />
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Tier 2 · {r.qualification.scores.t2}/10</p>
            <GateList rows={r.qualification.tier2} />
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Tier 3 · {r.qualification.scores.t3}/5</p>
            <GateList rows={r.qualification.tier3} />
          </div>
        </CardContent>
      </Card>

      {/* 6 — CEMENT */}
      <Card>
        <CardHeader>
          <CardTitle>6 · CEMENT score — {r.cement.score.pct}%</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {r.cement.layers.map((l) => (
            <div key={l.key} className="rounded-md border p-2 text-sm">
              <div className="font-medium">{l.label} <span className="text-xs text-muted-foreground">· {l.months}</span></div>
              {l.actions.map((a) => (
                <div key={a.key} className="flex items-center gap-1 text-xs">
                  <span className={a.done ? 'text-green-600' : 'text-zinc-300'}>{a.done ? '✓' : '○'}</span> {a.label}
                </div>
              ))}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* 7 — Recommendations */}
      <Card>
        <CardHeader>
          <CardTitle>7 · Recommendations</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {r.recommendations.map((rec, i) => (
              <li key={i}>{rec}</li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* 8 — Next-step scripts */}
      <Card>
        <CardHeader>
          <CardTitle>8 · Next-step scripts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {r.nextStepScripts.map((s) => (
            <div key={s.situation} className="rounded-md border p-3">
              <div className="text-xs font-semibold uppercase text-muted-foreground">{s.label}</div>
              <p className="mt-1 text-sm">{s.script}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* 9 — Slides */}
      <Card>
        <CardHeader>
          <CardTitle>9 · Slide layouts</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {r.slides.map((sl, i) => (
            <div key={i} className="rounded-md border p-3">
              <div className="font-medium">{sl.title}</div>
              <ul className="list-disc pl-5 text-sm text-muted-foreground">
                {sl.bullets.map((b, j) => (
                  <li key={j}>{b}</li>
                ))}
              </ul>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
