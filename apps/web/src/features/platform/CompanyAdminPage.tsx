import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { apiGet, apiList, apiPost, apiPatch, apiDelete, apiError } from '@/lib/api';
import type { Company, Team, User } from '@/types/api';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { EmptyState } from '@/components/shared/EmptyState';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from '@/components/ui/toaster';
import { roleLabel, ASSIGNABLE_ROLES } from '@/lib/roleLabels';

const FRAMEWORKS = ['general', 'ignite_apex'];

// Platform-owner view: manage a single company in context — its settings, teams,
// and members. All calls carry this company's id so the platform owner operates
// inside the chosen tenant.
export function CompanyAdminPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const company = useQuery({
    queryKey: ['company', id],
    queryFn: () => apiGet<{ company: Company }>(`/companies/${id}`),
    enabled: Boolean(id),
  });
  const teams = useQuery({
    queryKey: ['company-teams', id],
    queryFn: () => apiList<Team>('/teams', { params: { companyId: id, limit: 200 } }),
    enabled: Boolean(id),
  });
  const users = useQuery({
    queryKey: ['company-users', id],
    queryFn: () => apiList<User>('/users', { params: { companyId: id, limit: 200 } }),
    enabled: Boolean(id),
  });

  const refetchAll = () => {
    void qc.invalidateQueries({ queryKey: ['company', id] });
    void qc.invalidateQueries({ queryKey: ['company-teams', id] });
    void qc.invalidateQueries({ queryKey: ['company-users', id] });
  };

  if (company.isLoading) return <Skeleton className="h-64" />;
  const c = company.data?.company;
  if (!c) return null;

  return (
    <div className="space-y-6">
      <Link to="/platform" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline">
        <ArrowLeft className="h-4 w-4" /> Platform console
      </Link>
      <PageHeader title={c.name} actions={<StatusBadge value={c.status} />} />

      <SettingsCard company={c} onSaved={refetchAll} />
      <TeamsCard
        companyId={id}
        teams={teams.data?.items ?? []}
        users={users.data?.items ?? []}
        loading={teams.isLoading}
        onChange={refetchAll}
      />
      <MembersCard
        companyId={id}
        users={users.data?.items ?? []}
        teams={teams.data?.items ?? []}
        loading={users.isLoading}
        onChange={refetchAll}
      />
      <DangerZone company={c} onDeleted={() => navigate('/platform')} />
    </div>
  );
}

// ── Settings ──────────────────────────────────────────────────────────────────
function SettingsCard({ company, onSaved }: { company: Company; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: company.name,
    domain: company.domain ?? '',
    salesFramework: company.salesFramework ?? 'general',
    settings: JSON.stringify(company.settingsJson ?? {}, null, 2),
  });
  const [jsonError, setJsonError] = useState<string | null>(null);

  useEffect(() => {
    setForm({
      name: company.name,
      domain: company.domain ?? '',
      salesFramework: company.salesFramework ?? 'general',
      settings: JSON.stringify(company.settingsJson ?? {}, null, 2),
    });
  }, [company]);

  const save = useMutation({
    mutationFn: () => {
      let settings: Record<string, unknown> = {};
      try {
        settings = form.settings.trim() ? JSON.parse(form.settings) : {};
      } catch {
        throw new Error('Settings must be valid JSON');
      }
      return apiPatch(`/companies/${company.id}`, {
        name: form.name,
        domain: form.domain || null,
        salesFramework: form.salesFramework,
        settings,
      });
    },
    onSuccess: () => { toast({ title: 'Company saved', variant: 'success' }); onSaved(); },
    onError: (e) => toast({ title: 'Save failed', description: apiError(e), variant: 'destructive' }),
  });

  function onSettingsChange(v: string) {
    setForm({ ...form, settings: v });
    try { if (v.trim()) JSON.parse(v); setJsonError(null); } catch { setJsonError('Invalid JSON'); }
  }

  return (
    <Card>
      <CardHeader><CardTitle>Settings</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Company name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Domain</Label>
            <Input value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })} placeholder="acme.com" />
          </div>
          <div className="space-y-1.5">
            <Label>Sales framework</Label>
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={form.salesFramework}
              onChange={(e) => setForm({ ...form, salesFramework: e.target.value })}
            >
              {FRAMEWORKS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Settings (product / market / ICP — JSON)</Label>
          <Textarea className="font-mono text-xs" rows={8} value={form.settings} onChange={(e) => onSettingsChange(e.target.value)} />
          {jsonError && <p className="text-xs text-destructive">{jsonError}</p>}
        </div>
        <Button onClick={() => save.mutate()} disabled={save.isPending || Boolean(jsonError)}>
          {save.isPending ? 'Saving…' : 'Save settings'}
        </Button>
      </CardContent>
    </Card>
  );
}

// ── Teams ─────────────────────────────────────────────────────────────────────
function TeamsCard({
  companyId, teams, users, loading, onChange,
}: { companyId: string; teams: Team[]; users: User[]; loading: boolean; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', department: '', managerUserId: '' });

  const create = useMutation({
    mutationFn: () => apiPost('/teams', {
      companyId,
      name: form.name,
      department: form.department || undefined,
      ...(form.managerUserId ? { managerUserId: form.managerUserId } : {}),
    }),
    onSuccess: () => { toast({ title: 'Team created', variant: 'success' }); setOpen(false); setForm({ name: '', department: '', managerUserId: '' }); onChange(); },
    onError: (e) => toast({ title: 'Could not create', description: apiError(e), variant: 'destructive' }),
  });
  const setManager = useMutation({
    mutationFn: ({ teamId, managerUserId }: { teamId: string; managerUserId: string }) =>
      apiPatch(`/teams/${teamId}`, { managerUserId: managerUserId || null }),
    onSuccess: () => { toast({ title: 'Manager updated', variant: 'success' }); onChange(); },
    onError: (e) => toast({ title: 'Could not set manager', description: apiError(e), variant: 'destructive' }),
  });
  const del = useMutation({
    mutationFn: (teamId: string) => apiDelete(`/teams/${teamId}`),
    onSuccess: () => { toast({ title: 'Team deleted', variant: 'success' }); onChange(); },
    onError: (e) => toast({ title: 'Delete failed', description: apiError(e), variant: 'destructive' }),
  });

  const noMembers = users.length === 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Teams</CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4" /> New team</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New team</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Department</Label><Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} /></div>
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
                {noMembers && <p className="text-xs text-muted-foreground">Add a member first to assign a manager (you can also set it later).</p>}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={() => create.mutate()} disabled={!form.name.trim() || create.isPending}>Create</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : teams.length === 0 ? (
          <EmptyState title="No teams" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow><TableHead>Name</TableHead><TableHead>Department</TableHead><TableHead>Manager</TableHead><TableHead>Members</TableHead><TableHead></TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {teams.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.name}</TableCell>
                  <TableCell>{t.department ?? '—'}</TableCell>
                  <TableCell>
                    {/* Inline manager assignment — handles teams created before any members existed. */}
                    <select
                      className="rounded-md border border-input bg-background px-2 py-1 text-xs"
                      value={t.manager?.id ?? ''}
                      onChange={(e) => setManager.mutate({ teamId: t.id, managerUserId: e.target.value })}
                    >
                      <option value="">— none —</option>
                      {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                  </TableCell>
                  <TableCell>{t._count?.members ?? 0}</TableCell>
                  <TableCell className="text-right">
                    <button className="text-muted-foreground hover:text-destructive" onClick={() => del.mutate(t.id)} disabled={del.isPending} title="Delete team">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ── Members ───────────────────────────────────────────────────────────────────
function MembersCard({
  companyId, users, teams, loading, onChange,
}: { companyId: string; users: User[]; teams: Team[]; loading: boolean; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'sdr', teamId: '' });

  const create = useMutation({
    mutationFn: () => apiPost('/users', {
      companyId, name: form.name, email: form.email, password: form.password,
      role: form.role, ...(form.teamId ? { teamId: form.teamId } : {}),
    }),
    onSuccess: () => { toast({ title: 'User created', variant: 'success' }); setOpen(false); setForm({ name: '', email: '', password: '', role: 'sdr', teamId: '' }); onChange(); },
    onError: (e) => toast({ title: 'Could not create', description: apiError(e), variant: 'destructive' }),
  });
  const changeRole = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) => apiPost(`/users/${userId}/role`, { role }),
    onSuccess: () => { toast({ title: 'Role updated', variant: 'success' }); onChange(); },
    onError: (e) => toast({ title: 'Could not change role', description: apiError(e), variant: 'destructive' }),
  });
  const transfer = useMutation({
    mutationFn: ({ userId, teamId }: { userId: string; teamId: string }) => apiPost(`/users/${userId}/transfer`, { teamId: teamId || null }),
    onSuccess: () => { toast({ title: 'User transferred', variant: 'success' }); onChange(); },
    onError: (e) => toast({ title: 'Transfer failed', description: apiError(e), variant: 'destructive' }),
  });
  const del = useMutation({
    mutationFn: (userId: string) => apiDelete(`/users/${userId}`),
    onSuccess: () => { toast({ title: 'User deleted', variant: 'success' }); onChange(); },
    onError: (e) => toast({ title: 'Delete failed', description: apiError(e), variant: 'destructive' }),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Members</CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4" /> New member</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New member</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              </div>
              <div className="space-y-1.5"><Label>Temporary password</Label><Input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Role</Label>
                  <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                    {ASSIGNABLE_ROLES.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Team</Label>
                  <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.teamId} onChange={(e) => setForm({ ...form, teamId: e.target.value })}>
                    <option value="">— none —</option>
                    {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={() => create.mutate()} disabled={!form.name.trim() || !form.email.trim() || form.password.length < 8 || create.isPending}>Create</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : users.length === 0 ? (
          <EmptyState title="No members" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow><TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead>Role</TableHead><TableHead>Team</TableHead><TableHead>Status</TableHead><TableHead></TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.name}</TableCell>
                  <TableCell className="text-muted-foreground">{u.email}</TableCell>
                  <TableCell>
                    <select className="rounded-md border border-input bg-background px-2 py-1 text-xs" value={u.role} onChange={(e) => changeRole.mutate({ userId: u.id, role: e.target.value })}>
                      {ASSIGNABLE_ROLES.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
                    </select>
                  </TableCell>
                  <TableCell>
                    <select className="rounded-md border border-input bg-background px-2 py-1 text-xs" value={u.teamId ?? ''} onChange={(e) => transfer.mutate({ userId: u.id, teamId: e.target.value })}>
                      <option value="">— none —</option>
                      {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </TableCell>
                  <TableCell><StatusBadge value={u.status} /></TableCell>
                  <TableCell className="text-right">
                    <button className="text-muted-foreground hover:text-destructive" onClick={() => del.mutate(u.id)} disabled={del.isPending} title="Delete user">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ── Danger zone ───────────────────────────────────────────────────────────────
function DangerZone({ company, onDeleted }: { company: Company; onDeleted: () => void }) {
  const empty = (company._count?.users ?? 0) === 0 && (company._count?.teams ?? 0) === 0;
  const del = useMutation({
    mutationFn: () => apiDelete(`/companies/${company.id}`),
    onSuccess: () => { toast({ title: 'Company deleted', variant: 'success' }); onDeleted(); },
    onError: (e) => toast({ title: 'Delete failed', description: apiError(e), variant: 'destructive' }),
  });
  return (
    <Card className="border-destructive/40">
      <CardHeader><CardTitle className="text-destructive">Danger zone</CardTitle></CardHeader>
      <CardContent className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {empty ? 'This company is empty and can be deleted.' : 'Remove all users, teams, campaigns and contacts before deleting.'}
        </p>
        <Button variant="destructive" disabled={!empty || del.isPending} onClick={() => del.mutate()}>
          <Trash2 className="h-4 w-4" /> Delete company
        </Button>
      </CardContent>
    </Card>
  );
}
