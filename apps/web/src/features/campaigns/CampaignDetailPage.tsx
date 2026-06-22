import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { apiGet, apiPost, apiError } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toaster';
import { formatNumber } from '@/lib/utils';
import { CampaignSequences } from '@/features/sequences/CampaignSequences';

interface CampaignDetail {
  campaign: { id: string; name: string; status: string };
  metrics: { sent: number; replies: number; replyRate: number; meetingsBooked: number; interested: number };
  enrolled: number;
  replyBreakdown: Record<string, number>;
}

const ACTIONS: Record<string, string[]> = {
  draft: ['activate', 'archive'],
  active: ['pause', 'complete'],
  paused: ['resume', 'complete', 'archive'],
  completed: ['archive'],
};

export function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { canWrite } = useAuth();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['campaign-detail', id],
    queryFn: () => apiGet<CampaignDetail>(`/analytics/campaigns/${id}`),
    enabled: Boolean(id),
  });

  const transition = useMutation({
    mutationFn: (action: string) => apiPost(`/campaigns/${id}/${action}`),
    onSuccess: () => {
      toast({ title: 'Campaign updated', variant: 'success' });
      void qc.invalidateQueries({ queryKey: ['campaign-detail', id] });
    },
    onError: (e) => toast({ title: 'Action failed', description: apiError(e), variant: 'destructive' }),
  });

  if (isLoading) return <Skeleton className="h-64" />;
  if (!data) return null;

  const actions = canWrite ? (ACTIONS[data.campaign.status] ?? []) : [];

  return (
    <div>
      <Link to="/campaigns" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline">
        <ArrowLeft className="h-4 w-4" /> Campaigns
      </Link>
      <PageHeader
        title={data.campaign.name}
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge value={data.campaign.status} />
            {actions.map((a) => (
              <Button key={a} variant="outline" size="sm" onClick={() => transition.mutate(a)} disabled={transition.isPending}>
                {a}
              </Button>
            ))}
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {[
          ['Enrolled', data.enrolled],
          ['Sent', data.metrics.sent],
          ['Replies', data.metrics.replies],
          ['Reply rate', `${data.metrics.replyRate}%`],
          ['Meetings', data.metrics.meetingsBooked],
        ].map(([label, value]) => (
          <Card key={label as string}>
            <CardContent className="pt-6">
              <div className="text-xs text-muted-foreground">{label}</div>
              <div className="text-2xl font-bold">{typeof value === 'number' ? formatNumber(value) : value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Reply breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          {Object.keys(data.replyBreakdown).length === 0 ? (
            <p className="text-sm text-muted-foreground">No replies yet.</p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {Object.entries(data.replyBreakdown).map(([k, v]) => (
                <div key={k} className="rounded-md border px-3 py-2 text-sm">
                  <span className="capitalize">{k.replace('_', ' ')}</span>: <strong>{v}</strong>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {id && <CampaignSequences campaignId={id} />}
    </div>
  );
}
