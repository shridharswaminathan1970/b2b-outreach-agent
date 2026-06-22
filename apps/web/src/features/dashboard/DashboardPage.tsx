import { useQuery } from '@tanstack/react-query';
import { Megaphone, Users, Send, MessageSquare, Target, TrendingUp } from 'lucide-react';
import { apiGet } from '@/lib/api';
import type { AnalyticsOverview, Pipeline } from '@/types/api';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency, formatNumber } from '@/lib/utils';
import { RecommendationsWidget } from '@/features/recommendations/recommendations';

function StatCard({
  label,
  value,
  icon: Icon,
  hint,
}: {
  label: string;
  value: string;
  icon: typeof Megaphone;
  hint?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

export function DashboardPage() {
  const overview = useQuery({
    queryKey: ['analytics', 'overview'],
    queryFn: () => apiGet<AnalyticsOverview>('/analytics/overview'),
  });
  const pipeline = useQuery({
    queryKey: ['analytics', 'pipeline'],
    queryFn: () => apiGet<Pipeline>('/analytics/pipeline'),
  });

  const loading = overview.isLoading || pipeline.isLoading;

  return (
    <div>
      <PageHeader title="Dashboard" description="Your outreach and pipeline at a glance." />

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard
              label="Active campaigns"
              value={formatNumber(overview.data?.campaigns.active)}
              icon={Megaphone}
              hint={`${formatNumber(overview.data?.campaigns.total)} total`}
            />
            <StatCard
              label="Contacts"
              value={formatNumber(overview.data?.contacts.total)}
              icon={Users}
              hint={`${formatNumber(overview.data?.contacts.suppressed)} suppressed`}
            />
            <StatCard label="Messages sent" value={formatNumber(overview.data?.outreach.sent)} icon={Send} />
            <StatCard
              label="Reply rate"
              value={`${overview.data?.outreach.replyRate ?? 0}%`}
              icon={MessageSquare}
              hint={`${formatNumber(overview.data?.outreach.replies)} replies`}
            />
            <StatCard
              label="Meetings booked"
              value={formatNumber(overview.data?.outreach.meetingsBooked)}
              icon={Target}
            />
            <StatCard
              label="Weighted forecast"
              value={formatCurrency(pipeline.data?.weightedForecast)}
              icon={TrendingUp}
              hint={`${formatCurrency(pipeline.data?.open.value)} open`}
            />
          </div>

          <RecommendationsWidget limit={5} />

          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Pipeline by stage</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
                {pipeline.data?.byStage.map((s) => (
                  <div key={s.stage} className="rounded-md border p-3">
                    <div className="text-xs capitalize text-muted-foreground">{s.stage.replace('_', ' ')}</div>
                    <div className="mt-1 text-lg font-semibold">{formatCurrency(s.value)}</div>
                    <div className="text-xs text-muted-foreground">{s.count} deals</div>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-6 text-sm">
                <span>
                  Win rate: <strong>{pipeline.data?.winRate ?? 0}%</strong>
                </span>
                <span>
                  Won: <strong>{formatCurrency(pipeline.data?.won.value)}</strong> ({pipeline.data?.won.count})
                </span>
                <span>
                  Lost: <strong>{pipeline.data?.lost.count ?? 0}</strong>
                </span>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
