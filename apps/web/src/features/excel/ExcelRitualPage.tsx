import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

// EXCEL is the rep's daily operating system from the IGNITE-APEX framework — not
// deal-specific, so it lives client-side, reset each day and stored per user/day
// in localStorage (no server state needed).

const PEAK_RITUAL = [
  'Reviewed today’s trigger-qualified targets before any outreach',
  'Led with education / insight — zero pitch in first touches',
  'Logged every conviction signal the moment it appeared',
  'Advanced only deals that cleared their gate',
  'Made one value deposit with no ask',
];

const RESILIENCE = [
  'Separated the rejection of the offer from rejection of me',
  'Re-read one root-cause note to reconnect with the mission',
  'Booked the next action before closing the laptop',
];

function todayKey(userId: string | undefined): string {
  const d = new Date();
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return `excel-ritual:${userId ?? 'anon'}:${day}`;
}

export function ExcelRitualPage() {
  const { user } = useAuth();
  const key = todayKey(user?.id);
  const [state, setState] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      setState(raw ? (JSON.parse(raw) as Record<string, boolean>) : {});
    } catch {
      setState({});
    }
  }, [key]);

  const toggle = (id: string) => {
    setState((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* ignore quota */
      }
      return next;
    });
  };

  const all = [...PEAK_RITUAL, ...RESILIENCE];
  const done = all.filter((_, i) => state[`i${i}`]).length;

  const Row = ({ id, label }: { id: string; label: string }) => (
    <label className={cn('flex cursor-pointer items-start gap-2 rounded-md border p-3 text-sm', state[id] && 'bg-green-50')}>
      <input type="checkbox" className="mt-0.5" checked={!!state[id]} onChange={() => toggle(id)} />
      <span>{label}</span>
    </label>
  );

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="EXCEL — daily ritual"
        description={`Your demand-gen operating rhythm for today. ${done}/${all.length} complete.`}
      />
      <div className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle>Peak Performance Ritual</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {PEAK_RITUAL.map((label, i) => (
              <Row key={i} id={`i${i}`} label={label} />
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Rejection Resilience Protocol</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {RESILIENCE.map((label, i) => (
              <Row key={i} id={`i${PEAK_RITUAL.length + i}`} label={label} />
            ))}
          </CardContent>
        </Card>
        <p className="text-xs text-muted-foreground">Resets automatically each day.</p>
      </div>
    </div>
  );
}
