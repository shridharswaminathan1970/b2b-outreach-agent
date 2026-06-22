// UI copy for the IGNITE-APEX deal workspace (question/criterion labels). The
// backend owns scoring/gates; these are presentation labels only.

export const DEMAND_GATE = [
  { key: 'tg1', label: 'Conviction, not complaint', help: 'Their exact "this cannot go on" quote.' },
  { key: 'tg2', label: '24-month consequence cascade', help: 'Operational, strategic and competitive fallout.' },
  { key: 'tg3', label: 'Prior-attempt audit', help: 'The real reason it failed before.' },
  { key: 'tg4', label: 'Unprompted commercial signals', help: 'They raised commercials without prompting.' },
  { key: 'tg5', label: 'Personal stake', help: 'A named individual who owns the outcome.' },
];

export const ICP_CRITERIA = [
  { key: 'budgetAuthority', label: 'Budget Authority' },
  { key: 'painIntensity', label: 'Pain Intensity' },
  { key: 'strategicFit', label: 'Strategic Fit' },
  { key: 'timelineDecision', label: 'Timeline / Decision' },
  { key: 'competitorExposure', label: 'Competitor Exposure' },
];

export const TIER2 = [
  { key: 'q1', label: 'Economic buyer named and directly engaged' },
  { key: 'q2', label: 'Prospect invested something irrecoverable' },
  { key: 'q3', label: 'Hard external forcing event with a date' },
  { key: 'q4', label: 'A real objection has surfaced' },
  { key: 'q5', label: 'Deal survives if the champion leaves' },
  { key: 'q6', label: 'Decision criteria explicitly stated' },
  { key: 'q7', label: 'Structural change in the last 90 days' },
  { key: 'q8', label: 'Full competitive landscape incl. do-nothing' },
  { key: 'q9', label: 'Paper / procurement process fully mapped' },
  { key: 'q10', label: 'The $10,000 bet' },
];

export const TIER3 = [
  { key: 't1', label: 'Unprompted commercial language from the buyer' },
  { key: 't2', label: 'Internal meeting intelligence' },
  { key: 't3', label: 'Multi-stakeholder validation (≥2 beyond primary)' },
  { key: 't4', label: 'Kill risk named with a mitigation' },
  { key: 't5', label: 'Slip cause pre-diagnosed' },
];

export const ENTRY_POINT_LABELS: Record<string, string> = {
  insight_led: 'Insight-led opening',
  peer_reference: 'Peer reference trigger',
  consequence_24mo: '24-month consequence',
  low_commitment: 'Low-commitment entry',
  warm_signal: 'Warm signal response',
};

export const SEQUENCE_DAYS = [
  { key: 'd1', label: 'Day 1 — LinkedIn + reframe' },
  { key: 'd3', label: 'Day 3 — value touch (no ask)' },
  { key: 'd5', label: 'Day 5 — peer reference' },
  { key: 'd7', label: 'Day 7 — consequence picture' },
  { key: 'd9', label: 'Day 9 — permission close' },
];

export const VERDICT_TONE: Record<string, string> = {
  disqualified: 'bg-red-100 text-red-800 border-red-200',
  pipeline_only: 'bg-zinc-100 text-zinc-700 border-zinc-200',
  pipeline_plus: 'bg-amber-100 text-amber-800 border-amber-200',
  best_case: 'bg-blue-100 text-blue-800 border-blue-200',
  commit_forecast: 'bg-green-100 text-green-800 border-green-200',
};
