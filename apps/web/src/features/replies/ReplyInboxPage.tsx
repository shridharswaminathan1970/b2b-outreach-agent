import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarCheck, Ban } from 'lucide-react';
import { apiList, apiPost, apiError } from '@/lib/api';
import type { Reply } from '@/types/api';
import { useAuth } from '@/hooks/useAuth';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { EmptyState } from '@/components/shared/EmptyState';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/components/ui/toaster';
import { formatDate } from '@/lib/utils';

export function ReplyInboxPage() {
  const { canWrite } = useAuth();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<'all' | 'unhandled'>('unhandled');

  const { data, isLoading } = useQuery({
    queryKey: ['replies', filter],
    queryFn: () =>
      apiList<Reply>('/replies', {
        params: { limit: 50, ...(filter === 'unhandled' ? { handled: false } : {}) },
      }),
  });

  const handle = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'booked_meeting' | 'suppressed' }) =>
      apiPost<{ opportunity?: { id: string; name: string } | null }>(`/replies/${id}/handle`, { action }),
    onSuccess: (res, v) => {
      if (v.action === 'booked_meeting') {
        toast({
          title: 'Meeting booked',
          description: res.opportunity ? `Opportunity created: ${res.opportunity.name}` : undefined,
          variant: 'success',
        });
      } else {
        toast({ title: 'Contact suppressed', variant: 'success' });
      }
      void qc.invalidateQueries({ queryKey: ['replies'] });
    },
    onError: (e) => toast({ title: 'Action failed', description: apiError(e), variant: 'destructive' }),
  });

  return (
    <div>
      <PageHeader
        title="Reply inbox"
        description="Inbound replies classified by AI. Booking a meeting auto-creates an opportunity."
        actions={
          <div className="flex gap-1">
            {(['unhandled', 'all'] as const).map((f) => (
              <Button key={f} variant={filter === f ? 'default' : 'outline'} size="sm" onClick={() => setFilter(f)}>
                {f}
              </Button>
            ))}
          </div>
        }
      />

      <Card>
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : !data?.items.length ? (
          <EmptyState title="No replies" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Contact</TableHead>
                <TableHead>Classification</TableHead>
                <TableHead>Summary</TableHead>
                <TableHead>Received</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.contact?.name ?? '—'}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <StatusBadge value={r.classification} />
                      {r.needsHumanReview && <Badge variant="warning">review</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-muted-foreground">{r.summary ?? '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(r.receivedAt)}</TableCell>
                  <TableCell className="text-right">
                    {r.handled ? (
                      <Badge variant="muted">{r.handleAction ?? 'handled'}</Badge>
                    ) : canWrite ? (
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="outline" onClick={() => handle.mutate({ id: r.id, action: 'booked_meeting' })}>
                          <CalendarCheck className="h-4 w-4" /> Book
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => handle.mutate({ id: r.id, action: 'suppressed' })}>
                          <Ban className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">view only</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
