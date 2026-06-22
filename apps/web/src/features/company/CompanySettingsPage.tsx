import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPatch, apiError } from '@/lib/api';
import type { Company } from '@/types/api';
import { useAuth } from '@/hooks/useAuth';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toaster';
import { formatNumber } from '@/lib/utils';

export function CompanySettingsPage() {
  const { isSuperAdmin } = useAuth();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['company', 'me'],
    queryFn: () => apiGet<{ company: Company }>('/companies/me'),
  });

  const [form, setForm] = useState({ name: '', domain: '', billingPlan: '', salesFramework: 'general', settings: '{}' });

  useEffect(() => {
    if (data?.company) {
      setForm({
        name: data.company.name ?? '',
        domain: data.company.domain ?? '',
        billingPlan: data.company.billingPlan ?? '',
        salesFramework: data.company.salesFramework ?? 'general',
        settings: JSON.stringify(data.company.settingsJson ?? {}, null, 2),
      });
    }
  }, [data]);

  const save = useMutation({
    mutationFn: () => {
      let settings: unknown;
      try {
        settings = JSON.parse(form.settings || '{}');
      } catch {
        throw new Error('Settings must be valid JSON');
      }
      return apiPatch('/companies/me', {
        name: form.name,
        domain: form.domain || null,
        billingPlan: form.billingPlan || null,
        salesFramework: form.salesFramework,
        settings,
      });
    },
    onSuccess: () => {
      toast({ title: 'Company settings saved', variant: 'success' });
      void qc.invalidateQueries({ queryKey: ['company', 'me'] });
    },
    onError: (e) => toast({ title: 'Save failed', description: apiError(e), variant: 'destructive' }),
  });

  if (isLoading) return <Skeleton className="h-96" />;

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Company settings"
        description={isSuperAdmin ? 'Manage your company profile, billing, and AI/ICP configuration.' : 'View your company profile.'}
      />

      <div className="mb-4 grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-xs text-muted-foreground">Users</div>
            <div className="text-2xl font-bold">{formatNumber(data?.company._count?.users)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-xs text-muted-foreground">Teams</div>
            <div className="text-2xl font-bold">{formatNumber(data?.company._count?.teams)}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Company name</Label>
            <Input value={form.name} disabled={!isSuperAdmin} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Domain</Label>
              <Input value={form.domain} disabled={!isSuperAdmin} onChange={(e) => setForm({ ...form, domain: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Billing plan</Label>
              <Input
                value={form.billingPlan}
                disabled={!isSuperAdmin}
                placeholder="e.g. growth"
                onChange={(e) => setForm({ ...form, billingPlan: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Sales framework</Label>
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-60"
              value={form.salesFramework}
              disabled={!isSuperAdmin}
              onChange={(e) => setForm({ ...form, salesFramework: e.target.value })}
            >
              <option value="general">General software sales (default pipeline)</option>
              <option value="ignite_apex">IGNITE-APEX Sales OS (demand-gen, gated qualification)</option>
            </select>
            <p className="text-xs text-muted-foreground">
              IGNITE-APEX adds the gated stages (IGNITE → ATTRACT → PROBE → EXECUTE → COMMIT), the qualification
              verdict, the deal workspace, and CEMENT post-sale tracking. Switching does not alter existing deals'
              data, only how stages and gates are applied.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Settings (product / market / ICP — JSON)</Label>
            <textarea
              className="min-h-[160px] w-full rounded-md border border-input bg-background p-2 font-mono text-xs disabled:opacity-60"
              value={form.settings}
              disabled={!isSuperAdmin}
              onChange={(e) => setForm({ ...form, settings: e.target.value })}
            />
          </div>
          {isSuperAdmin && (
            <div className="flex justify-end">
              <Button onClick={() => save.mutate()} disabled={save.isPending}>
                Save changes
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
