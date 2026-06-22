import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, SlidersHorizontal } from 'lucide-react';
import { Link } from 'react-router-dom';
import { apiList, apiPost, apiError } from '@/lib/api';
import type { Opportunity, Pipeline } from '@/types/api';
import type { OpportunitiesMeta } from '@/types/ignite';
import { apiGet } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { EmptyState } from '@/components/shared/EmptyState';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from '@/components/ui/toaster';
import { formatCurrency } from '@/lib/utils';

export function OpportunitiesPage() {
  const { canWrite } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', amount: '', stage: '' });

  const meta = useQuery({ queryKey: ['opp-meta'], queryFn: () => apiGet<OpportunitiesMeta>('/opportunities/meta') });
  const isIgnite = meta.data?.activeFramework === 'ignite_apex';
  const STAGES = useMemo(() => {
    const fw = meta.data?.frameworks.find((f) => f.id === meta.data?.activeFramework);
    return fw?.stages.map((s) => s.id) ?? ['new', 'qualified', 'proposal', 'negotiation', 'closed_won', 'closed_lost'];
  }, [meta.data]);

  const pipeline = useQuery({ queryKey: ['analytics', 'pipeline'], queryFn: () => apiGet<Pipeline>('/analytics/pipeline') });
  const { data, isLoading } = useQuery({
    queryKey: ['opportunities'],
    queryFn: () => apiList<Opportunity>('/opportunities', { params: { limit: 100 } }),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['opportunities'] });
    void qc.invalidateQueries({ queryKey: ['analytics', 'pipeline'] });
  };

  const create = useMutation({
    mutationFn: () =>
      apiPost('/opportunities', {
        name: form.name,
        ...(form.stage ? { stage: form.stage } : {}),
        ...(form.amount ? { amount: Number(form.amount) } : {}),
      }),
    onSuccess: () => {
      toast({ title: 'Opportunity created', variant: 'success' });
      setOpen(false);
      setForm({ name: '', amount: '', stage: '' });
      invalidate();
    },
    onError: (e) => toast({ title: 'Could not create', description: apiError(e), variant: 'destructive' }),
  });

  const changeStage = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: string }) => apiPost(`/opportunities/${id}/stage`, { stage }),
    onSuccess: () => {
      toast({ title: 'Stage updated', variant: 'success' });
      invalidate();
    },
    onError: (e) => toast({ title: 'Update failed', description: apiError(e), variant: 'destructive' }),
  });

  return (
    <div>
      <PageHeader
        title="Pipeline"
        description="Opportunities and forecast for your team."
        actions={
          canWrite && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4" /> New opportunity
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>New opportunity</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label>Name</Label>
                    <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Amount</Label>
                      <Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Stage</Label>
                      <select
                        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                        value={form.stage}
                        onChange={(e) => setForm({ ...form, stage: e.target.value })}
                      >
                        <option value="">Auto (first stage)</option>
                        {STAGES.map((s) => (
                          <option key={s} value={s}>
                            {s.replace('_', ' ')}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={() => create.mutate()} disabled={!form.name.trim() || create.isPending}>
                    Create
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          ['Open pipeline', formatCurrency(pipeline.data?.open.value)],
          ['Weighted forecast', formatCurrency(pipeline.data?.weightedForecast)],
          ['Closed won', formatCurrency(pipeline.data?.won.value)],
          ['Win rate', `${pipeline.data?.winRate ?? 0}%`],
        ].map(([label, value]) => (
          <Card key={label}>
            <CardContent className="pt-6">
              <div className="text-xs text-muted-foreground">{label}</div>
              <div className="text-xl font-bold">{value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : !data?.items.length ? (
          <EmptyState title="No opportunities" hint={canWrite ? 'Create one or book a meeting to auto-create.' : undefined} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Stage</TableHead>
                {isIgnite && <TableHead>Verdict</TableHead>}
                <TableHead>Amount</TableHead>
                <TableHead>Prob.</TableHead>
                <TableHead>Owner</TableHead>
                {isIgnite && <TableHead></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="font-medium">{o.name}</TableCell>
                  <TableCell>
                    {canWrite ? (
                      <select
                        className="rounded-md border border-input bg-background px-2 py-1 text-xs"
                        value={o.stage}
                        onChange={(e) => changeStage.mutate({ id: o.id, stage: e.target.value })}
                      >
                        {STAGES.map((s) => (
                          <option key={s} value={s}>
                            {s.replace('_', ' ')}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <StatusBadge value={o.stage} />
                    )}
                  </TableCell>
                  {isIgnite && (
                    <TableCell>
                      {o.verdict ? <StatusBadge value={o.verdict} /> : <span className="text-xs text-muted-foreground">—</span>}
                    </TableCell>
                  )}
                  <TableCell>{formatCurrency(o.amount, o.currency)}</TableCell>
                  <TableCell>{o.probability}%</TableCell>
                  <TableCell className="text-muted-foreground">{o.owner?.name ?? '—'}</TableCell>
                  {isIgnite && (
                    <TableCell>
                      <Link to={`/opportunities/${o.id}`}>
                        <Button size="sm" variant="outline">
                          <SlidersHorizontal className="h-3.5 w-3.5" /> Workspace
                        </Button>
                      </Link>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
