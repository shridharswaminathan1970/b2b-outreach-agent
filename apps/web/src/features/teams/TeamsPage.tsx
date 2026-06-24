import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { apiList, apiPost, apiPatch, apiError } from '@/lib/api';
import type { Team, User } from '@/types/api';
import { useAuth } from '@/hooks/useAuth';
import { PageHeader } from '@/components/shared/PageHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from '@/components/ui/toaster';

export function TeamsPage() {
  const { canWrite } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', department: '', managerUserId: '' });

  const { data, isLoading } = useQuery({ queryKey: ['teams'], queryFn: () => apiList<Team>('/teams', { params: { limit: 100 } }) });
  const usersQ = useQuery({
    queryKey: ['users', 'for-teams'],
    queryFn: () => apiList<User>('/users', { params: { limit: 200 } }),
    enabled: canWrite,
  });
  const users = usersQ.data?.items ?? [];

  const create = useMutation({
    mutationFn: () => apiPost('/teams', {
      name: form.name,
      department: form.department || undefined,
      ...(form.managerUserId ? { managerUserId: form.managerUserId } : {}),
    }),
    onSuccess: () => {
      toast({ title: 'Team created', variant: 'success' });
      setOpen(false);
      setForm({ name: '', department: '', managerUserId: '' });
      void qc.invalidateQueries({ queryKey: ['teams'] });
    },
    onError: (e) => toast({ title: 'Could not create', description: apiError(e), variant: 'destructive' }),
  });
  const setManager = useMutation({
    mutationFn: ({ teamId, managerUserId }: { teamId: string; managerUserId: string }) =>
      apiPatch(`/teams/${teamId}`, { managerUserId: managerUserId || null }),
    onSuccess: () => { toast({ title: 'Manager updated', variant: 'success' }); void qc.invalidateQueries({ queryKey: ['teams'] }); },
    onError: (e) => toast({ title: 'Could not set manager', description: apiError(e), variant: 'destructive' }),
  });

  return (
    <div>
      <PageHeader
        title="Teams"
        description="Teams within your company."
        actions={
          canWrite && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4" /> New team
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>New team</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label>Name</Label>
                    <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Department</Label>
                    <Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Manager</Label>
                    <select
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={form.managerUserId}
                      onChange={(e) => setForm({ ...form, managerUserId: e.target.value })}
                    >
                      <option value="">— none —</option>
                      {users.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
                    </select>
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
      <Card>
        {isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : !data?.items.length ? (
          <EmptyState title="No teams" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Manager</TableHead>
                <TableHead>Members</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.name}</TableCell>
                  <TableCell>{t.department ?? '—'}</TableCell>
                  <TableCell>
                    {canWrite ? (
                      <select
                        className="rounded-md border border-input bg-background px-2 py-1 text-xs"
                        value={t.manager?.id ?? ''}
                        onChange={(e) => setManager.mutate({ teamId: t.id, managerUserId: e.target.value })}
                      >
                        <option value="">— none —</option>
                        {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                      </select>
                    ) : (
                      <span className="text-muted-foreground">{t.manager?.name ?? '—'}</span>
                    )}
                  </TableCell>
                  <TableCell>{t._count?.members ?? 0}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
