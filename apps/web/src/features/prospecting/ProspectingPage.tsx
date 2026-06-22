import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Download, ChevronLeft, ChevronRight, Lock, Sparkles, Loader2 } from 'lucide-react';
import { apiPost, apiError } from '@/lib/api';
import type {
  ProspectPerson,
  ProspectSearchResult,
  ProspectImportSummary,
  EnrichBatchSummary,
} from '@/types/api';
import { useAuth } from '@/hooks/useAuth';
import { PageHeader } from '@/components/shared/PageHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/components/ui/toaster';
import { cn } from '@/lib/utils';

const SENIORITIES = ['owner', 'founder', 'c_suite', 'vp', 'director', 'manager'];
const EMPLOYEE_RANGES: { value: string; label: string }[] = [
  { value: '1,10', label: '1–10' },
  { value: '11,50', label: '11–50' },
  { value: '51,200', label: '51–200' },
  { value: '201,500', label: '201–500' },
  { value: '501,1000', label: '501–1k' },
  { value: '1001,5000', label: '1k–5k' },
];

// Split a comma/newline separated string into a trimmed array.
function toArray(v: string): string[] | undefined {
  const arr = v
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  return arr.length ? arr : undefined;
}

function keyOf(p: ProspectPerson): string {
  return p.externalId || p.email || p.linkedinUrl || p.name;
}

export function ProspectingPage() {
  const { canWrite } = useAuth();
  const qc = useQueryClient();

  const [form, setForm] = useState({ titles: '', keywords: '', domains: '', locations: '' });
  const [seniorities, setSeniorities] = useState<string[]>([]);
  const [ranges, setRanges] = useState<string[]>([]);
  const [result, setResult] = useState<ProspectSearchResult | null>(null);
  const [selected, setSelected] = useState<Record<string, ProspectPerson>>({});

  const toggle = <T,>(list: T[], v: T): T[] => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const filters = useMemo(
    () => ({
      titles: toArray(form.titles),
      keywords: form.keywords.trim() || undefined,
      domains: toArray(form.domains),
      locations: toArray(form.locations),
      seniorities: seniorities.length ? seniorities : undefined,
      employeeRanges: ranges.length ? ranges : undefined,
    }),
    [form, seniorities, ranges],
  );

  const hasFilter = Boolean(
    filters.titles || filters.keywords || filters.domains || filters.locations || filters.seniorities || filters.employeeRanges,
  );

  const search = useMutation({
    mutationFn: (page: number) => apiPost<ProspectSearchResult>('/prospecting/search', { ...filters, page, perPage: 25 }),
    onSuccess: (data) => setResult(data),
    onError: (e) => toast({ title: 'Search failed', description: apiError(e), variant: 'destructive' }),
  });

  const importSel = useMutation({
    mutationFn: () => apiPost<ProspectImportSummary>('/prospecting/import', { people: Object.values(selected) }),
    onSuccess: (s) => {
      toast({
        title: `Imported ${s.imported} contact(s)`,
        description: `${s.duplicatesInDb} already existed, ${s.accountsCreated} account(s) created.`,
        variant: 'success',
      });
      setSelected({});
      void qc.invalidateQueries({ queryKey: ['contacts'] });
    },
    onError: (e) => toast({ title: 'Import failed', description: apiError(e), variant: 'destructive' }),
  });

  // Import the selected prospects, then immediately enrich (Apollo people-match)
  // to unlock emails — the common case, since search results are usually locked.
  const importEnrich = useMutation({
    mutationFn: async () => {
      const imp = await apiPost<ProspectImportSummary>('/prospecting/import', {
        people: Object.values(selected),
      });
      let enr: EnrichBatchSummary | null = null;
      if (imp.createdIds.length) {
        enr = await apiPost<EnrichBatchSummary>('/contacts/enrich', { contactIds: imp.createdIds });
      }
      return { imp, enr };
    },
    onSuccess: ({ imp, enr }) => {
      toast({
        title: `Imported ${imp.imported}, unlocked ${enr?.emailsUnlocked ?? 0} email(s)`,
        description: `${imp.duplicatesInDb} already existed.`,
        variant: 'success',
      });
      setSelected({});
      void qc.invalidateQueries({ queryKey: ['contacts'] });
    },
    onError: (e) => toast({ title: 'Import & enrich failed', description: apiError(e), variant: 'destructive' }),
  });

  const people = result?.people ?? [];
  const selCount = Object.keys(selected).length;
  const allSelected = people.length > 0 && people.every((p) => selected[keyOf(p)]);
  const totalPages = result ? Math.max(1, Math.ceil(result.total / result.perPage)) : 1;

  function toggleAll() {
    setSelected((prev) => {
      const next = { ...prev };
      if (allSelected) people.forEach((p) => delete next[keyOf(p)]);
      else people.forEach((p) => (next[keyOf(p)] = p));
      return next;
    });
  }
  function toggleOne(p: ProspectPerson) {
    setSelected((prev) => {
      const next = { ...prev };
      const k = keyOf(p);
      if (next[k]) delete next[k];
      else next[k] = p;
      return next;
    });
  }

  return (
    <div>
      <PageHeader
        title="Prospecting"
        description="Search for new prospects and import them into your contacts."
        actions={
          canWrite && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => importSel.mutate()}
                disabled={selCount === 0 || importSel.isPending || importEnrich.isPending}
              >
                <Download className="h-4 w-4" /> Import {selCount > 0 ? `${selCount} ` : ''}to contacts
              </Button>
              <Button
                onClick={() => importEnrich.mutate()}
                disabled={selCount === 0 || importEnrich.isPending || importSel.isPending}
              >
                {importEnrich.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                Import &amp; enrich
              </Button>
            </div>
          )
        }
      />

      {/* Filters */}
      <Card className="mb-5">
        <CardHeader>
          <CardTitle className="text-base">Search filters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Job titles</Label>
              <Input
                placeholder="Head of Operations, VP Sales"
                value={form.titles}
                onChange={(e) => setForm({ ...form, titles: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Keywords</Label>
              <Input
                placeholder="logistics automation"
                value={form.keywords}
                onChange={(e) => setForm({ ...form, keywords: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Company domains</Label>
              <Input
                placeholder="acme.com, novastack.io"
                value={form.domains}
                onChange={(e) => setForm({ ...form, domains: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Locations</Label>
              <Input
                placeholder="Singapore, United Arab Emirates"
                value={form.locations}
                onChange={(e) => setForm({ ...form, locations: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Seniority</Label>
            <div className="flex flex-wrap gap-1.5">
              {SENIORITIES.map((s) => (
                <button
                  key={s}
                  onClick={() => setSeniorities((prev) => toggle(prev, s))}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs capitalize',
                    seniorities.includes(s) ? 'border-primary bg-primary text-primary-foreground' : 'text-muted-foreground',
                  )}
                >
                  {s.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Headcount</Label>
            <div className="flex flex-wrap gap-1.5">
              {EMPLOYEE_RANGES.map((r) => (
                <button
                  key={r.value}
                  onClick={() => setRanges((prev) => toggle(prev, r.value))}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs',
                    ranges.includes(r.value) ? 'border-primary bg-primary text-primary-foreground' : 'text-muted-foreground',
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              onClick={() => {
                setSelected({});
                search.mutate(1);
              }}
              disabled={!hasFilter || search.isPending}
            >
              <Search className="h-4 w-4" /> Search
            </Button>
            {!hasFilter && <span className="text-xs text-muted-foreground">Add at least one filter.</span>}
            {result && !result.live && (
              <Badge variant="muted">Sample data — set APOLLO_API_KEY for live results</Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {search.isPending ? (
        <Card>
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        </Card>
      ) : !result ? (
        <EmptyState title="No search yet" hint="Set filters and run a search to find prospects." />
      ) : people.length === 0 ? (
        <EmptyState title="No prospects found" hint="Try broadening your filters." />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                </TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Email</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {people.map((p) => {
                const k = keyOf(p);
                return (
                  <TableRow key={k} className={cn(selected[k] && 'bg-primary/5')}>
                    <TableCell>
                      <input type="checkbox" checked={Boolean(selected[k])} onChange={() => toggleOne(p)} />
                    </TableCell>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{p.title ?? '—'}</TableCell>
                    <TableCell className="text-sm">
                      {p.company ?? '—'}
                      {p.companySize && <span className="text-xs text-muted-foreground"> · {p.companySize}</span>}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{p.location ?? '—'}</TableCell>
                    <TableCell className="text-sm">
                      {p.email ? (
                        p.email
                      ) : (
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <Lock className="h-3 w-3" /> locked
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <div className="flex items-center justify-between border-t p-3 text-sm text-muted-foreground">
            <span>
              {result.total.toLocaleString()} matches · page {result.page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={result.page <= 1 || search.isPending}
                onClick={() => search.mutate(result.page - 1)}
              >
                <ChevronLeft className="h-4 w-4" /> Prev
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={result.page >= totalPages || search.isPending}
                onClick={() => search.mutate(result.page + 1)}
              >
                Next <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
