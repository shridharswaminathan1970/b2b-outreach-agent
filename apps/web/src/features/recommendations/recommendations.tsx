import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Lightbulb, Copy, Check, ArrowRight } from 'lucide-react';
import { apiGet } from '@/lib/api';
import type { DealRecommendation, RecommendationList } from '@/types/ignite';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils';

const PRIORITY_TONE: Record<string, string> = {
  high: 'bg-red-100 text-red-800 border-red-200',
  medium: 'bg-amber-100 text-amber-800 border-amber-200',
  low: 'bg-zinc-100 text-zinc-700 border-zinc-200',
};

export function PriorityBadge({ priority }: { priority: string }) {
  return (
    <span className={cn('rounded border px-2 py-0.5 text-xs font-semibold capitalize', PRIORITY_TONE[priority] ?? PRIORITY_TONE.low)}>
      {priority}
    </span>
  );
}

// Single-deal next-best-action card (used in the deal workspace). Includes the
// AI-generated script with a copy button.
export function NextActionCard({ opportunityId }: { opportunityId: string }) {
  const [copied, setCopied] = useState(false);
  const { data, isLoading, isError } = useQuery({
    queryKey: ['recommendation', opportunityId],
    queryFn: () => apiGet<DealRecommendation>(`/opportunities/${opportunityId}/recommendation`),
    retry: false,
  });

  if (isLoading) return <Skeleton className="mb-5 h-28" />;
  if (isError || !data) return null;

  const r = data.recommendation;
  const copy = async () => {
    if (!r.script) return;
    try {
      await navigator.clipboard.writeText(r.script);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <Card className="mb-5 border-primary/30">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Lightbulb className="h-4 w-4 text-primary" /> Recommended next step
        </CardTitle>
        <PriorityBadge priority={r.priority} />
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="font-medium">{r.action}</div>
        <p className="text-sm text-muted-foreground">{r.rationale}</p>
        {r.script && (
          <div className="rounded-md border bg-muted/30 p-3">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase text-muted-foreground">Suggested script</span>
              <Button size="sm" variant="ghost" onClick={copy}>
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
            <p className="whitespace-pre-wrap text-sm">{r.script}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Dashboard widget: top open deals ranked by urgency with their next action.
export function RecommendationsWidget({ limit = 5 }: { limit?: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ['recommendations', limit],
    queryFn: () => apiGet<RecommendationList>(`/opportunities/recommendations?limit=${limit}`),
  });

  if (isLoading) return <Skeleton className="mt-6 h-48" />;
  if (!data || data.items.length === 0) return null;

  const isIgnite = data.framework === 'ignite_apex';

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-primary" /> Recommended next actions
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="divide-y">
          {data.items.map((it) => {
            const row = (
              <div className="flex items-center gap-3 py-2.5">
                <PriorityBadge priority={it.recommendation.priority} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{it.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{it.recommendation.action}</div>
                </div>
                <div className="hidden text-right text-xs text-muted-foreground sm:block">
                  {it.amount != null && <div>{formatCurrency(it.amount)}</div>}
                  <div className="capitalize">{it.stage.replace('_', ' ')}</div>
                </div>
                {isIgnite && <ArrowRight className="h-4 w-4 text-muted-foreground" />}
              </div>
            );
            return isIgnite ? (
              <Link key={it.id} to={`/opportunities/${it.id}`} className="block hover:bg-accent/40">
                {row}
              </Link>
            ) : (
              <div key={it.id}>{row}</div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
