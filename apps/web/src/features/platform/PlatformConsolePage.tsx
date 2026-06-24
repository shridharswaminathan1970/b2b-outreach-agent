import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, X, Plus, Building2, ChevronRight } from 'lucide-react';
import { apiGet, apiList, apiPost, apiError } from '@/lib/api';
import { PageHeader } from '@/components/shared/PageHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from '@/components/ui/toaster';

interface SignupRequest {
  id: string;
  companyName: string;
  fullName: string;
  email: string;
  country: string | null;
  status: string;
}
interface CompanyRow {
  id: string;
  name: string;
  status: string;
  _count?: { users: number; teams: number; campaigns: number; contacts: number };
}
interface ApproveResult {
  emailSent: boolean;
  resetUrl: string;
}

// Platform owner console: manage every company (CRUD) and review the self-serve
// signup requests.
export function PlatformConsolePage() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');

  const companies = useQuery({
    queryKey: ['platform-companies'],
    queryFn: () => apiList<CompanyRow>('/companies', { params: { limit: 200 } }),
  });
  const requests = useQuery({
    queryKey: ['signup-requests'],
    queryFn: () => apiGet<{ items: SignupRequest[] }>('/provisioning/signup-requests'),
  });

  const createCompany = useMutation({
    mutationFn: () => apiPost('/companies', { name: newName.trim() }),
    onSuccess: () => {
      toast({ title: 'Company created', variant: 'success' });
      setCreateOpen(false);
      setNewName('');
      void qc.invalidateQueries({ queryKey: ['platform-companies'] });
    },
    onError: (e) => toast({ title: 'Could not create', description: apiError(e), variant: 'destructive' }),
  });

  const approve = useMutation({
    mutationFn: (id: string) => apiPost<ApproveResult>(`/provisioning/signup-requests/${id}/approve`, {}),
    onSuccess: (res) => {
      toast({
        title: 'Approved & provisioned',
        description: res.emailSent ? 'Set-password link emailed.' : 'Email not sent — link copied below.',
        variant: 'success',
      });
      if (!res.emailSent && res.resetUrl) {
        navigator.clipboard?.writeText(res.resetUrl).catch(() => undefined);
        toast({ title: 'Reset link copied', description: res.resetUrl });
      }
      void qc.invalidateQueries({ queryKey: ['signup-requests'] });
      void qc.invalidateQueries({ queryKey: ['platform-companies'] });
    },
    onError: (e) => toast({ title: 'Approve failed', description: apiError(e), variant: 'destructive' }),
  });
  const reject = useMutation({
    mutationFn: (id: string) => apiPost(`/provisioning/signup-requests/${id}/reject`, {}),
    onSuccess: () => { toast({ title: 'Request rejected', variant: 'success' }); void qc.invalidateQueries({ queryKey: ['signup-requests'] }); },
    onError: (e) => toast({ title: 'Reject failed', description: apiError(e), variant: 'destructive' }),
  });

  const reqItems = requests.data?.items ?? [];
  const pending = reqItems.filter((r) => r.status === 'pending').length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Platform console"
        description="Manage every company and review access requests."
        actions={
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4" /> New company</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New company</DialogTitle></DialogHeader>
              <div className="space-y-1.5">
                <Label>Company name</Label>
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Acme Inc" />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                <Button onClick={() => createCompany.mutate()} disabled={!newName.trim() || createCompany.isPending}>Create</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      {/* Companies */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Building2 className="h-4 w-4" /> Companies</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {companies.isLoading ? (
            <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
          ) : !companies.data?.items.length ? (
            <EmptyState title="No companies yet" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Users</TableHead>
                  <TableHead>Teams</TableHead>
                  <TableHead>Campaigns</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {companies.data.items.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">
                      <Link to={`/platform/companies/${c.id}`} className="hover:underline">{c.name}</Link>
                    </TableCell>
                    <TableCell><StatusBadge value={c.status} /></TableCell>
                    <TableCell>{c._count?.users ?? 0}</TableCell>
                    <TableCell>{c._count?.teams ?? 0}</TableCell>
                    <TableCell>{c._count?.campaigns ?? 0}</TableCell>
                    <TableCell className="text-right">
                      <Button asChild size="sm" variant="ghost">
                        <Link to={`/platform/companies/${c.id}`}>Manage <ChevronRight className="h-3.5 w-3.5" /></Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Signup requests */}
      <Card>
        <CardHeader>
          <CardTitle>Signup requests — {pending} pending</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {requests.isLoading ? (
            <div className="space-y-2 p-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
          ) : reqItems.length === 0 ? (
            <EmptyState title="No signup requests yet" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reqItems.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.companyName}</TableCell>
                    <TableCell>{r.fullName}</TableCell>
                    <TableCell className="text-muted-foreground">{r.email}</TableCell>
                    <TableCell><StatusBadge value={r.status} /></TableCell>
                    <TableCell className="text-right">
                      {r.status === 'pending' && (
                        <div className="flex justify-end gap-2">
                          <Button size="sm" disabled={approve.isPending} onClick={() => approve.mutate(r.id)}>
                            <Check className="h-3.5 w-3.5" /> Approve
                          </Button>
                          <Button size="sm" variant="ghost" disabled={reject.isPending} onClick={() => reject.mutate(r.id)}>
                            <X className="h-3.5 w-3.5" /> Reject
                          </Button>
                        </div>
                      )}
                    </TableCell>
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
