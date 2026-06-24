import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { CTA_LABELS, type CtaType } from './ctaConfig';

interface Brief {
  productName: string;
  productPurpose: string;
  targetCustomer: string;
  u1Unworkable: string;
  u2Urgent: string;
  u3Unavoidable: string;
  u4Underserved: string;
  positioningStatement: string;
  industry: string | null;
  companySize: string | null;
  economicBuyerName: string | null;
  economicBuyerDesignation: string | null;
  economicBuyerSeniority: string | null;
  economicBuyerEmail: string | null;
  coDecisionMakerName: string | null;
  coDecisionMakerDesignation: string | null;
  totalTouchpoints: number;
  trustRatio: number;
}
interface Step {
  id: string;
  stepOrder: number;
  touchType: string;
  ctaType: string | null;
  ctaConfigJson: Record<string, unknown> | null;
}
interface BriefResponse {
  brief: Brief | null;
  sequence: { steps: Step[] } | null;
}

const TOUCH_LABELS: Record<string, string> = {
  trust_builder: 'Trust Builder',
  value_add: 'Value Add',
  intel_gathering: 'Intel Gathering',
  cta: 'CTA',
};

const U_ROWS: { key: keyof Brief; label: string }[] = [
  { key: 'u1Unworkable', label: 'Unworkable' },
  { key: 'u2Urgent', label: 'Urgent' },
  { key: 'u3Unavoidable', label: 'Unavoidable' },
  { key: 'u4Underserved', label: 'Underserved' },
];

function ctaConfigSummary(cfg: Record<string, unknown> | null): string {
  if (!cfg) return '';
  const v = Object.values(cfg).filter((x) => typeof x === 'string' && x.trim()) as string[];
  return v.slice(0, 2).join(' · ');
}

// Read-only view of a campaign's Brief + the auto-generated sequence plan. Shows
// nothing for legacy campaigns created before the Brief system.
export function CampaignBriefPanel({ campaignId }: { campaignId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['campaign-brief', campaignId],
    queryFn: () => apiGet<BriefResponse>(`/campaigns/${campaignId}/brief`),
    enabled: Boolean(campaignId),
  });

  if (isLoading) return <Skeleton className="mt-6 h-40" />;
  const brief = data?.brief;
  if (!brief) return null; // legacy campaign without a brief

  const steps = data?.sequence?.steps ?? [];
  const ctaCount = steps.filter((s) => s.touchType === 'cta').length;

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Campaign Brief</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Product brief */}
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <Cell label="Product" value={brief.productName} />
            <Cell label="What it does" value={brief.productPurpose} />
            <Cell label="Target customer" value={brief.targetCustomer} />
            <Cell label="Positioning" value={brief.positioningStatement} />
          </div>
          <div className="space-y-2 rounded-md border p-3">
            <div className="text-xs font-semibold uppercase text-muted-foreground">The four U’s</div>
            {U_ROWS.map((u) => (
              <div key={u.key} className="text-sm">
                <span className="font-medium">{u.label}: </span>
                <span className="text-muted-foreground">{String(brief[u.key] ?? '—')}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Persona */}
        <div className="rounded-md border p-3">
          <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Buyer persona</div>
          <div className="text-sm text-muted-foreground">
            {[
              brief.industry,
              brief.companySize && `${brief.companySize} staff`,
              brief.economicBuyerDesignation,
              brief.economicBuyerSeniority,
              brief.economicBuyerName,
              brief.economicBuyerEmail,
            ]
              .filter(Boolean)
              .join(' · ') || 'Not specified'}
            {brief.coDecisionMakerName ? ` · co-decision: ${brief.coDecisionMakerName}` : ''}
          </div>
        </div>

        {/* Sequence plan */}
        <div className="rounded-md border">
          <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-2">
            <span className="text-xs font-semibold uppercase text-muted-foreground">Sequence plan</span>
            <span className="text-xs text-muted-foreground">
              {steps.length} touches · {steps.length - ctaCount} trust + {ctaCount} CTA
            </span>
          </div>
          <ol className="divide-y text-sm">
            {steps.map((s) => (
              <li key={s.id} className="flex items-center gap-3 px-3 py-2">
                <span className="w-6 text-center font-semibold">{s.stepOrder}</span>
                <Badge variant={s.touchType === 'cta' ? 'secondary' : 'muted'}>
                  {TOUCH_LABELS[s.touchType] ?? s.touchType}
                </Badge>
                {s.touchType === 'cta' && (
                  <span className="text-xs text-muted-foreground">
                    {s.ctaType ? CTA_LABELS[s.ctaType as CtaType] : 'unconfigured'}
                    {ctaConfigSummary(s.ctaConfigJson) ? ` · ${ctaConfigSummary(s.ctaConfigJson)}` : ''}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </div>
      </CardContent>
    </Card>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase text-muted-foreground">{label}</div>
      <div className="text-sm">{value}</div>
    </div>
  );
}
