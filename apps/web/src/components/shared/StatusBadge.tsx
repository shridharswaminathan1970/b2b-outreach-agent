import { Badge } from '@/components/ui/badge';
import { humanize } from '@/lib/utils';

// Maps common status / stage / classification strings to a badge style.
const VARIANT: Record<string, 'default' | 'secondary' | 'success' | 'warning' | 'destructive' | 'muted'> = {
  // campaigns
  active: 'success',
  draft: 'muted',
  paused: 'warning',
  completed: 'secondary',
  archived: 'muted',
  // contacts
  new: 'secondary',
  qualified: 'success',
  contacted: 'default',
  review: 'warning',
  // drafts
  pending_review: 'warning',
  approved: 'success',
  sent: 'default',
  rejected: 'destructive',
  // replies
  interested: 'success',
  objection: 'warning',
  unsubscribe: 'destructive',
  bounce: 'destructive',
  out_of_office: 'muted',
  unknown: 'muted',
  // opportunities
  proposal: 'default',
  negotiation: 'default',
  closed_won: 'success',
  closed_lost: 'destructive',
};

export function StatusBadge({ value }: { value: string | null | undefined }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  return <Badge variant={VARIANT[value] ?? 'secondary'}>{humanize(value)}</Badge>;
}
