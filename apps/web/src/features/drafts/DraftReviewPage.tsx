import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, X } from 'lucide-react';
import { apiList, apiPost, apiError } from '@/lib/api';
import type { Draft } from '@/types/api';
import { useAuth } from '@/hooks/useAuth';
import { PageHeader } from '@/components/shared/PageHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toaster';

export function DraftReviewPage() {
  const { canWrite } = useAuth();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['drafts', 'pending_review'],
    queryFn: () => apiList<Draft>('/drafts', { params: { status: 'pending_review', limit: 50 } }),
  });

  const act = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'approve' | 'reject' }) =>
      apiPost(`/drafts/${id}/${action}`, action === 'reject' ? { reason: 'Rejected from review queue' } : undefined),
    onSuccess: (_d, v) => {
      toast({ title: v.action === 'approve' ? 'Draft approved' : 'Draft rejected', variant: 'success' });
      void qc.invalidateQueries({ queryKey: ['drafts'] });
    },
    onError: (e) => toast({ title: 'Action failed', description: apiError(e), variant: 'destructive' }),
  });

  return (
    <div>
      <PageHeader title="Draft review" description="AI-generated drafts awaiting approval before sending." />

      {isLoading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      ) : !data?.items.length ? (
        <EmptyState title="Queue is empty" hint="No drafts pending review." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {data.items.map((d) => (
            <Card key={d.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{d.contact?.name ?? 'Contact'}</CardTitle>
                  <div className="flex gap-1">
                    {d.qualityScore && <Badge variant="muted">Q {Number(d.qualityScore).toFixed(2)}</Badge>}
                    {d.personalizationScore && (
                      <Badge variant="muted">P {Number(d.personalizationScore).toFixed(2)}</Badge>
                    )}
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">{d.contact?.email}</p>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <div className="text-xs font-medium text-muted-foreground">Subject</div>
                  <div className="text-sm font-medium">{d.subject ?? '—'}</div>
                </div>
                <div>
                  <div className="text-xs font-medium text-muted-foreground">Body</div>
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground line-clamp-6">{d.body ?? '—'}</p>
                </div>
                {canWrite && (
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" onClick={() => act.mutate({ id: d.id, action: 'approve' })} disabled={act.isPending}>
                      <Check className="h-4 w-4" /> Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => act.mutate({ id: d.id, action: 'reject' })}
                      disabled={act.isPending}
                    >
                      <X className="h-4 w-4" /> Reject
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
