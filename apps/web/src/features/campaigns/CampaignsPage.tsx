import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { apiList } from '@/lib/api';
import type { Campaign } from '@/types/api';
import { useAuth } from '@/hooks/useAuth';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { EmptyState } from '@/components/shared/EmptyState';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDate, formatNumber } from '@/lib/utils';

export function CampaignsPage() {
  const { canWrite } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['campaigns'],
    queryFn: () => apiList<Campaign>('/campaigns', { params: { limit: 100 } }),
  });

  return (
    <div>
      <PageHeader
        title="Campaigns"
        description="Outreach campaigns scoped to your team."
        actions={
          canWrite && (
            <Button asChild>
              <Link to="/campaigns/new">
                <Plus className="h-4 w-4" /> New campaign
              </Link>
            </Button>
          )
        }
      />

      <Card>
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : !data?.items.length ? (
          <EmptyState title="No campaigns yet" hint={canWrite ? 'Create your first campaign.' : undefined} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Sequences</TableHead>
                <TableHead>Enrolled</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">
                    <Link to={`/campaigns/${c.id}`} className="hover:underline">
                      {c.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <StatusBadge value={c.status} />
                  </TableCell>
                  <TableCell>{formatNumber(c._count?.sequences)}</TableCell>
                  <TableCell>{formatNumber(c._count?.enrollments)}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(c.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
