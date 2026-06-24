import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, X } from 'lucide-react';
import { apiGet, apiPost, apiError } from '@/lib/api';
import { PageHeader } from '@/components/shared/PageHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/components/ui/toaster';

interface SignupRequest {
  id: string;
  companyName: string;
  fullName: string;
  email: string;
  contactNumber: string | null;
  country: string | null;
  status: string;
  createdAt: string;
}

interface ApproveResult {
  companyId: string;
  userId: string;
  emailSent: boolean;
  resetUrl: string;
}

// Platform owner ("super duper admin") console: review signup requests and
// approve (provision company + super_admin + demo data + set-password email) or
// reject them.
export function PlatformConsolePage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['signup-requests'],
    queryFn: () => apiGet<{ items: SignupRequest[] }>('/provisioning/signup-requests'),
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey: ['signup-requests'] });

  const approve = useMutation({
    mutationFn: (id: string) => apiPost<ApproveResult>(`/provisioning/signup-requests/${id}/approve`, {}),
    onSuccess: (res) => {
      toast({
        title: 'Approved & provisioned',
        description: res.emailSent ? 'Set-password link emailed to the user.' : 'Email not sent — copy the link below.',
        variant: 'success',
      });
      if (!res.emailSent && res.resetUrl) {
        navigator.clipboard?.writeText(res.resetUrl).catch(() => undefined);
        toast({ title: 'Reset link copied to clipboard', description: res.resetUrl, variant: 'default' });
      }
      invalidate();
    },
    onError: (e) => toast({ title: 'Approve failed', description: apiError(e), variant: 'destructive' }),
  });

  const reject = useMutation({
    mutationFn: (id: string) => apiPost(`/provisioning/signup-requests/${id}/reject`, {}),
    onSuccess: () => { toast({ title: 'Request rejected', variant: 'success' }); invalidate(); },
    onError: (e) => toast({ title: 'Reject failed', description: apiError(e), variant: 'destructive' }),
  });

  const items = data?.items ?? [];
  const pending = items.filter((r) => r.status === 'pending').length;

  return (
    <div>
      <PageHeader title="Platform console" description={`Signup requests — ${pending} pending`} />
      <Card>
        {isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : items.length === 0 ? (
          <EmptyState title="No signup requests yet" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Country</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.companyName}</TableCell>
                  <TableCell>{r.fullName}</TableCell>
                  <TableCell className="text-muted-foreground">{r.email}</TableCell>
                  <TableCell className="text-muted-foreground">{r.country ?? '—'}</TableCell>
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
      </Card>
    </div>
  );
}
