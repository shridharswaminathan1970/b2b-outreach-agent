import { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Upload, Search, Sparkles, Loader2 } from 'lucide-react';
import { apiList, apiPost, apiError, http } from '@/lib/api';
import type { Contact } from '@/types/api';
import { useAuth } from '@/hooks/useAuth';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { EmptyState } from '@/components/shared/EmptyState';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from '@/components/ui/toaster';

export function ContactsPage() {
  const { canWrite } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['contacts', search],
    queryFn: () => apiList<Contact>('/contacts', { params: { limit: 100, ...(search ? { search } : {}) } }),
  });

  // One-click enrich (Apollo people-match) for a contact missing an email.
  const [enrichingId, setEnrichingId] = useState<string | null>(null);
  const enrich = useMutation({
    mutationFn: (id: string) =>
      apiPost<{ contact: Contact; emailUnlocked: boolean; found: boolean }>(`/contacts/${id}/enrich`, {}),
    onMutate: (id) => setEnrichingId(id),
    onSuccess: (res) => {
      toast({
        title: res.emailUnlocked ? 'Email unlocked' : res.found ? 'Contact enriched' : 'No match found',
        description: res.contact?.email ?? undefined,
        variant: res.found ? 'success' : 'destructive',
      });
      void qc.invalidateQueries({ queryKey: ['contacts'] });
    },
    onError: (e) => toast({ title: 'Enrich failed', description: apiError(e), variant: 'destructive' }),
    onSettled: () => setEnrichingId(null),
  });

  const importCsv = useMutation({
    mutationFn: async () => {
      const file = fileRef.current?.files?.[0];
      if (!file) throw new Error('Choose a CSV file');
      const form = new FormData();
      form.append('file', file);
      const res = await http.post('/contacts/import', form);
      return res.data?.data;
    },
    onSuccess: (summary: { imported?: number; total?: number }) => {
      toast({ title: `Imported ${summary?.imported ?? 0}/${summary?.total ?? 0}`, variant: 'success' });
      setImportOpen(false);
      void qc.invalidateQueries({ queryKey: ['contacts'] });
    },
    onError: (e) => toast({ title: 'Import failed', description: apiError(e), variant: 'destructive' }),
  });

  return (
    <div>
      <PageHeader
        title="Contacts"
        description="Leads in your team's prospect list."
        actions={
          canWrite && (
            <Dialog open={importOpen} onOpenChange={setImportOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Upload className="h-4 w-4" /> Import CSV
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Import contacts (CSV)</DialogTitle>
                </DialogHeader>
                <p className="text-sm text-muted-foreground">
                  Columns: firstName, lastName, email, title, company, phone, linkedinUrl. Duplicate emails are skipped.
                </p>
                <input ref={fileRef} type="file" accept=".csv" className="text-sm" />
                <DialogFooter>
                  <Button variant="outline" onClick={() => setImportOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={() => importCsv.mutate()} disabled={importCsv.isPending}>
                    Upload
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )
        }
      />

      <div className="mb-4 flex max-w-sm items-center gap-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search contacts…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <Card>
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : !data?.items.length ? (
          <EmptyState title="No contacts" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>ICP</TableHead>
                {canWrite && <TableHead></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">
                    {c.name}
                    {c.suppressed && (
                      <Badge variant="destructive" className="ml-2">
                        suppressed
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{c.email ?? '—'}</TableCell>
                  <TableCell>{c.title ?? '—'}</TableCell>
                  <TableCell>{c.account?.name ?? '—'}</TableCell>
                  <TableCell>
                    <StatusBadge value={c.status} />
                  </TableCell>
                  <TableCell>{c.icpScore}</TableCell>
                  {canWrite && (
                    <TableCell className="text-right">
                      {!c.email && !c.suppressed && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={enrichingId === c.id}
                          onClick={() => enrich.mutate(c.id)}
                        >
                          {enrichingId === c.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Sparkles className="h-3.5 w-3.5" />
                          )}
                          Enrich
                        </Button>
                      )}
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
