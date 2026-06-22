import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { apiGet } from '@/lib/api';
import type { Pipeline } from '@/types/api';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { humanize } from '@/lib/utils';

interface CampaignMetricRow {
  id: string;
  name: string;
  status: string;
  metrics: { sent: number; replies: number; replyRate: number; meetingsBooked: number };
}

export function AnalyticsPage() {
  const pipeline = useQuery({ queryKey: ['analytics', 'pipeline'], queryFn: () => apiGet<Pipeline>('/analytics/pipeline') });
  const campaigns = useQuery({
    queryKey: ['analytics', 'campaigns'],
    queryFn: () => apiGet<CampaignMetricRow[]>('/analytics/campaigns'),
  });

  const chartData =
    pipeline.data?.byStage.map((s) => ({ stage: humanize(s.stage), value: s.value, count: s.count })) ?? [];

  return (
    <div>
      <PageHeader title="Analytics" description="Campaign performance and pipeline forecast." />

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Pipeline value by stage</CardTitle>
        </CardHeader>
        <CardContent>
          {pipeline.isLoading ? (
            <Skeleton className="h-64" />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="stage" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="value" fill="hsl(222 47% 31%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Campaign performance</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {campaigns.isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Sent</TableHead>
                  <TableHead>Replies</TableHead>
                  <TableHead>Reply rate</TableHead>
                  <TableHead>Meetings</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.data?.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>{c.metrics.sent}</TableCell>
                    <TableCell>{c.metrics.replies}</TableCell>
                    <TableCell>{c.metrics.replyRate}%</TableCell>
                    <TableCell>{c.metrics.meetingsBooked}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
