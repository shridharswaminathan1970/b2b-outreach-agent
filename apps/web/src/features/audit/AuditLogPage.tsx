import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { apiList, http, apiError } from '@/lib/api';
import type { AuditLog } from '@/types/api';
import { PageHeader } from '@/components/shared/PageHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/components/ui/toaster';
import { formatDate } from '@/lib/utils';

export function AuditLogPage() {
  const [entityType, setEntityType] = useState('');
  const [exporting, setExporting] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['audit', entityType],
    queryFn: () => apiList<AuditLog>('/audit', { params: { limit: 100, ...(entityType ? { entityType } : {}) } }),
  });

  async function exportCsv() {
    setExporting(true);
    try {
      const res = await http.get('/audit/export', {
        params: { ...(entityType ? { entityType } : {}) },
        responseType: 'blob',
      });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast({ title: 'Export failed', description: apiError(e), variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Audit log"
        description="Every state change in your company, append-only."
        actions={
          <Button variant="outline" onClick={exportCsv} disabled={exporting}>
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        }
      />
      <div className="mb-4 max-w-xs">
        <Input placeholder="Filter by entity type (e.g. contact)" value={entityType} onChange={(e) => setEntityType(e.target.value)} />
      </div>
      <Card>
        {isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-9" />)}</div>
        ) : !data?.items.length ? (
          <EmptyState title="No audit entries" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Summary</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(a.createdAt)}</TableCell>
                  <TableCell>
                    <Badge variant="muted">{a.entityType}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{a.action}</TableCell>
                  <TableCell className="text-muted-foreground">{a.actorType ?? '—'}</TableCell>
                  <TableCell className="max-w-md truncate">{a.summary ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
