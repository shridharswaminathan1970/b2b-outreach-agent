import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { apiList, apiPost, apiError } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { PageHeader } from '@/components/shared/PageHeader';
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

interface Prompt {
  id: string;
  name: string;
  purpose: string;
  version: number;
  isActive: boolean;
  isGlobal: boolean;
  modelName: string;
}

const PURPOSES = ['draft_generation', 'reply_classification', 'research_brief', 'quality_eval'];

export function PromptsPage() {
  const { isSuperAdmin } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: '',
    purpose: 'draft_generation',
    promptText: '',
    modelName: 'claude-sonnet-4-6',
    maxTokens: 1500,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['prompts'],
    queryFn: () => apiList<Prompt>('/prompts', { params: { includeGlobal: true, limit: 100 } }),
  });

  const create = useMutation({
    mutationFn: () => apiPost('/prompts', form),
    onSuccess: () => {
      toast({ title: 'Prompt override created', variant: 'success' });
      setOpen(false);
      void qc.invalidateQueries({ queryKey: ['prompts'] });
    },
    onError: (e) => toast({ title: 'Could not create', description: apiError(e), variant: 'destructive' }),
  });

  return (
    <div>
      <PageHeader
        title="AI Prompts"
        description="Company prompt overrides layered over the platform defaults."
        actions={
          isSuperAdmin && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4" /> New override
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>New prompt override</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label>Name</Label>
                    <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Purpose</Label>
                    <select
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={form.purpose}
                      onChange={(e) => setForm({ ...form, purpose: e.target.value })}
                    >
                      {PURPOSES.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Prompt text</Label>
                    <textarea
                      className="min-h-[120px] w-full rounded-md border border-input bg-background p-2 text-sm"
                      value={form.promptText}
                      onChange={(e) => setForm({ ...form, promptText: e.target.value })}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={() => create.mutate()} disabled={!form.name.trim() || !form.promptText.trim() || create.isPending}>
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
          <EmptyState title="No prompts" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Purpose</TableHead>
                <TableHead>Model</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead>Active</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell>{p.purpose}</TableCell>
                  <TableCell className="text-muted-foreground">{p.modelName}</TableCell>
                  <TableCell>v{p.version}</TableCell>
                  <TableCell>
                    <Badge variant={p.isGlobal ? 'muted' : 'default'}>{p.isGlobal ? 'global default' : 'company'}</Badge>
                  </TableCell>
                  <TableCell>{p.isActive ? <Badge variant="success">active</Badge> : <Badge variant="muted">off</Badge>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
