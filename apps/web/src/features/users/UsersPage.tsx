import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, ArrowRightLeft } from 'lucide-react';
import { apiList, apiPost, apiError } from '@/lib/api';
import type { User, Team } from '@/types/api';
import { useAuth } from '@/hooks/useAuth';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { EmptyState } from '@/components/shared/EmptyState';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from '@/components/ui/toaster';
import { humanize } from '@/lib/utils';

const ROLES = ['super_admin', 'management_admin', 'sales_manager', 'sdr'];

export function UsersPage() {
  const { canWrite, user } = useAuth();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [transferFor, setTransferFor] = useState<User | null>(null);
  const [transferTeam, setTransferTeam] = useState('');
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'sdr', teamId: '' });

  const { data, isLoading } = useQuery({ queryKey: ['users'], queryFn: () => apiList<User>('/users', { params: { limit: 100 } }) });
  const teams = useQuery({ queryKey: ['teams'], queryFn: () => apiList<Team>('/teams', { params: { limit: 100 } }), enabled: canWrite });

  const invalidate = () => void qc.invalidateQueries({ queryKey: ['users'] });

  const changeRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) => apiPost(`/users/${id}/role`, { role }),
    onSuccess: () => {
      toast({ title: 'Role updated', variant: 'success' });
      invalidate();
    },
    onError: (e) => toast({ title: 'Could not change role', description: apiError(e), variant: 'destructive' }),
  });

  const create = useMutation({
    mutationFn: () =>
      apiPost('/users', {
        name: form.name,
        email: form.email,
        password: form.password,
        role: form.role,
        ...(form.teamId ? { teamId: form.teamId } : {}),
      }),
    onSuccess: () => {
      toast({ title: 'User created', variant: 'success' });
      setCreateOpen(false);
      setForm({ name: '', email: '', password: '', role: 'sdr', teamId: '' });
      invalidate();
    },
    onError: (e) => toast({ title: 'Could not create', description: apiError(e), variant: 'destructive' }),
  });

  const transfer = useMutation({
    mutationFn: () => apiPost(`/users/${transferFor!.id}/transfer`, { teamId: transferTeam || null }),
    onSuccess: () => {
      toast({ title: 'User transferred', variant: 'success' });
      setTransferFor(null);
      setTransferTeam('');
      invalidate();
    },
    onError: (e) => toast({ title: 'Transfer failed', description: apiError(e), variant: 'destructive' }),
  });

  return (
    <div>
      <PageHeader
        title="Users"
        description="People in your company. You can manage users in your reporting line."
        actions={
          canWrite && (
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4" /> New user
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>New user</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Name</Label>
                      <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Email</Label>
                      <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Temporary password</Label>
                    <Input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Role</Label>
                      <select
                        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                        value={form.role}
                        onChange={(e) => setForm({ ...form, role: e.target.value })}
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {humanize(r)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Team</Label>
                      <select
                        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                        value={form.teamId}
                        onChange={(e) => setForm({ ...form, teamId: e.target.value })}
                      >
                        <option value="">— none —</option>
                        {teams.data?.items.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setCreateOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={() => create.mutate()}
                    disabled={!form.name.trim() || !form.email.trim() || form.password.length < 8 || create.isPending}
                  >
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
          <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : !data?.items.length ? (
          <EmptyState title="No users" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">
                    {u.name}
                    {u.id === user?.id && <Badge variant="muted" className="ml-2">you</Badge>}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{u.email}</TableCell>
                  <TableCell>
                    {canWrite && u.id !== user?.id ? (
                      <select
                        className="rounded-md border border-input bg-background px-2 py-1 text-xs"
                        value={u.role}
                        onChange={(e) => changeRole.mutate({ id: u.id, role: e.target.value })}
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {humanize(r)}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <Badge variant="secondary">{humanize(u.role)}</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusBadge value={u.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    {canWrite && u.id !== user?.id && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setTransferFor(u);
                          setTransferTeam(u.teamId ?? '');
                        }}
                      >
                        <ArrowRightLeft className="h-4 w-4" /> Transfer
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Dialog open={Boolean(transferFor)} onOpenChange={(o) => !o && setTransferFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transfer {transferFor?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Move to team</Label>
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={transferTeam}
              onChange={(e) => setTransferTeam(e.target.value)}
            >
              <option value="">— no team —</option>
              {teams.data?.items.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">You can only manage users in your own reporting line.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferFor(null)}>
              Cancel
            </Button>
            <Button onClick={() => transfer.mutate()} disabled={transfer.isPending}>
              Transfer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
