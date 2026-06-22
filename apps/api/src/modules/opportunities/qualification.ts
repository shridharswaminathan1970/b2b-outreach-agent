// IGNITE-APEX Sales OS — the structured deal record stored on
// Opportunity.qualificationJson, plus the scoring, master-verdict, and
// stage-gate logic that make "the constraints the product".
//
// Sections mirror the framework: IGNITE (prep) → ATTRACT (qualify) →
// PROBE (diagnose) → EXECUTE (20-question forecast protection) → CEMENT
// (post-sale). The General framework never touches any of this.
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Field-level building blocks
// ---------------------------------------------------------------------------

// A gated question: a pass flag plus the written, verifiable evidence the
// framework demands for every Tier-1/2/3 answer.
const gateItem = z.object({
  pass: z.boolean().default(false),
  evidence: z.string().trim().max(2000).default(''),
});
export type GateItem = z.infer<typeof gateItem>;

// Canonical question / criterion labels (shared by the report generator and the
// deal-workspace UI). Keys match the qualification JSON field names.
export const DEMAND_GATE_QUESTIONS = [
  { key: 'tg1', label: 'Conviction, not complaint (exact "this cannot go on" quote)' },
  { key: 'tg2', label: '24-month consequence cascade (operational / strategic / competitive)' },
  { key: 'tg3', label: 'Prior-attempt audit (the real reason it failed before)' },
  { key: 'tg4', label: 'Unprompted commercial signals' },
  { key: 'tg5', label: 'Personal stake (a named individual who owns the outcome)' },
] as const;

export const ICP_CRITERIA = [
  { key: 'budgetAuthority', label: 'Budget Authority' },
  { key: 'painIntensity', label: 'Pain Intensity' },
  { key: 'strategicFit', label: 'Strategic Fit' },
  { key: 'timelineDecision', label: 'Timeline / Decision' },
  { key: 'competitorExposure', label: 'Competitor Exposure' },
] as const;

export const TIER2_QUESTIONS = [
  { key: 'q1', label: 'Economic buyer named and directly engaged' },
  { key: 'q2', label: 'Prospect invested something irrecoverable' },
  { key: 'q3', label: 'Hard external forcing event with a date' },
  { key: 'q4', label: 'A real objection has surfaced' },
  { key: 'q5', label: 'Deal survives if the champion leaves' },
  { key: 'q6', label: 'Decision criteria explicitly stated' },
  { key: 'q7', label: 'Structural change in the last 90 days' },
  { key: 'q8', label: 'Full competitive landscape incl. do-nothing' },
  { key: 'q9', label: 'Paper / procurement process fully mapped' },
  { key: 'q10', label: 'The $10,000 bet (would you stake it on this closing?)' },
] as const;

export const TIER3_QUESTIONS = [
  { key: 't1', label: 'Unprompted commercial language from the buyer' },
  { key: 't2', label: 'Internal meeting intelligence' },
  { key: 't3', label: 'Multi-stakeholder validation (≥2 beyond primary)' },
  { key: 't4', label: 'Kill risk named with a mitigation' },
  { key: 't5', label: 'Slip cause pre-diagnosed' },
] as const;

// IGNITE → Nail-the-Insight entry points (pick one).
export const ENTRY_POINTS = [
  'insight_led',
  'peer_reference',
  'consequence_24mo',
  'low_commitment',
  'warm_signal',
] as const;

const sequenceTouch = z.object({
  done: z.boolean().default(false),
  note: z.string().trim().max(1000).default(''),
});

// ---------------------------------------------------------------------------
// IGNITE — pre-contact preparation (the six letters)
// ---------------------------------------------------------------------------
const igniteSchema = z.object({
  // I — Identify (trigger test + mindset)
  mindsetMissionary: z.boolean().default(false),
  mindsetIcpConfirmed: z.boolean().default(false),
  trigger: z.string().trim().max(2000).default(''),
  // G — Go Deep (15-min research)
  research: z
    .object({
      strategicPriorities: z.string().trim().max(2000).default(''),
      individual: z.string().trim().max(2000).default(''),
      competitivePressure: z.string().trim().max(2000).default(''),
      peerReference: z.string().trim().max(2000).default(''),
    })
    .default({}),
  // N — Nail the Insight
  educationWeapon: z.boolean().default(false),
  reframeOpener: z.string().trim().max(2000).default(''),
  entryPoint: z.enum(ENTRY_POINTS).nullish(),
  // I — Initiate (9-day sequence)
  sequence: z
    .object({
      d1: sequenceTouch.default({}),
      d3: sequenceTouch.default({}),
      d5: sequenceTouch.default({}),
      d7: sequenceTouch.default({}),
      d9: sequenceTouch.default({}),
    })
    .default({}),
  // T — Track & Nurture
  signals: z.array(z.string().trim().max(500)).default([]),
  valueDeposits: z.array(z.string().trim().max(500)).default([]),
  // E — Escalate
  convictionSignal: z.string().trim().max(2000).default(''),
  escalationAsk: z.string().trim().max(2000).default(''),
  escalationResponse: z.string().trim().max(2000).default(''),
});

// ---------------------------------------------------------------------------
// ATTRACT — Tier-1 Demand Gate (5) + ICP Scoring Matrix (5 × 0-20)
// ---------------------------------------------------------------------------
const icpCriterion = z.coerce.number().int().min(0).max(20).default(0);
const attractSchema = z.object({
  demandGate: z
    .object({
      tg1: gateItem.default({}), // Conviction, not complaint
      tg2: gateItem.default({}), // 24-month consequence cascade
      tg3: gateItem.default({}), // Prior-attempt audit
      tg4: gateItem.default({}), // Unprompted commercial signals
      tg5: gateItem.default({}), // Personal stake (named individual)
    })
    .default({}),
  icp: z
    .object({
      budgetAuthority: icpCriterion,
      painIntensity: icpCriterion,
      strategicFit: icpCriterion,
      timelineDecision: icpCriterion,
      competitorExposure: icpCriterion,
    })
    .default({}),
});

// ---------------------------------------------------------------------------
// PROBE — diagnosis (70% of the sale)
// ---------------------------------------------------------------------------
const probeSchema = z.object({
  rootCause: z
    .object({
      l1Symptom: z.string().trim().max(2000).default(''),
      l2Structural: z.string().trim().max(2000).default(''),
      l3Root: z.string().trim().max(2000).default(''), // their exact words — never paraphrase
    })
    .default({}),
  ladder: z
    .object({
      pain: z.string().trim().max(2000).default(''),
      impact: z.string().trim().max(2000).default(''),
      roi: z.string().trim().max(2000).default(''),
    })
    .default({}),
  champion: z
    .object({
      name: z.string().trim().max(200).default(''),
      role: z.string().trim().max(200).default(''),
    })
    .default({}),
  veto: z
    .object({
      name: z.string().trim().max(200).default(''),
      role: z.string().trim().max(200).default(''),
      concern: z.string().trim().max(2000).default(''),
      mitigation: z.string().trim().max(2000).default(''),
    })
    .default({}),
  closingTechnique: z.string().trim().max(200).default(''),
});

// ---------------------------------------------------------------------------
// EXECUTE — Tier-2 Opportunity Qualifier (10) + Tier-3 Forecast Commit Gate (5)
// ---------------------------------------------------------------------------
const executeSchema = z.object({
  tier2: z
    .object({
      q1: gateItem.default({}),
      q2: gateItem.default({}),
      q3: gateItem.default({}),
      q4: gateItem.default({}),
      q5: gateItem.default({}),
      q6: gateItem.default({}),
      q7: gateItem.default({}),
      q8: gateItem.default({}),
      q9: gateItem.default({}),
      q10: gateItem.default({}),
    })
    .default({}),
  tier3: z
    .object({
      t1: gateItem.default({}),
      t2: gateItem.default({}),
      t3: gateItem.default({}),
      t4: gateItem.default({}),
      t5: gateItem.default({}),
    })
    .default({}),
});

// ---------------------------------------------------------------------------
// CEMENT — post-sale architecture (5 layers, months 1-36+). Each layer is a
// fixed set of action keys → done flag; the CEMENT score is completed/total.
// ---------------------------------------------------------------------------
export const CEMENT_LAYERS = [
  {
    key: 'l1',
    label: 'Outcome Ownership',
    months: '1-3',
    actions: [
      { key: 'firstValueConfirmed', label: 'First measurable value confirmed' },
      { key: 'successMetricAgreed', label: 'Success metric agreed with buyer' },
      { key: 'executiveCheckin', label: 'Executive check-in completed' },
    ],
  },
  {
    key: 'l2',
    label: 'Stakeholder Expansion',
    months: '3-9',
    actions: [
      { key: 'secondDeptEngaged', label: 'Second department engaged' },
      { key: 'championPromoted', label: 'Champion advanced / promoted internally' },
      { key: 'newUseCaseFound', label: 'New use case identified' },
    ],
  },
  {
    key: 'l3',
    label: 'Institutional Knowledge',
    months: '6-18',
    actions: [
      { key: 'embeddedInWorkflow', label: 'Embedded in core workflow' },
      { key: 'documentedPlaybook', label: 'Documented playbook delivered' },
      { key: 'trainingDelivered', label: 'Team training delivered' },
    ],
  },
  {
    key: 'l4',
    label: 'Root-Cause Chain Expansion',
    months: '12-24',
    actions: [
      { key: 'adjacentRootCauseFound', label: 'Adjacent root cause surfaced' },
      { key: 'expansionProposalSent', label: 'Expansion proposal sent' },
      { key: 'budgetSecured', label: 'Expansion budget secured' },
    ],
  },
  {
    key: 'l5',
    label: 'Advocacy Engineering',
    months: '18-36',
    actions: [
      { key: 'referenceCallDone', label: 'Reference call delivered' },
      { key: 'caseStudyPublished', label: 'Case study published' },
      { key: 'referralIntroMade', label: 'Referral introduction made' },
    ],
  },
] as const;

const cementLayer = z.record(z.string(), z.boolean());
const cementSchema = z.object({
  l1: cementLayer.default({}),
  l2: cementLayer.default({}),
  l3: cementLayer.default({}),
  l4: cementLayer.default({}),
  l5: cementLayer.default({}),
});

// Full deal record. Every section is optional and filled progressively.
export const qualificationSchema = z.object({
  ignite: igniteSchema.default({}),
  attract: attractSchema.default({}),
  probe: probeSchema.default({}),
  execute: executeSchema.default({}),
  cement: cementSchema.default({}),
});
export type Qualification = z.infer<typeof qualificationSchema>;

// Partial input for PUT (deep-merged onto the stored record by the service).
export const qualificationInputSchema = z
  .object({
    ignite: igniteSchema.partial().optional(),
    attract: attractSchema.partial().optional(),
    probe: probeSchema.partial().optional(),
    execute: executeSchema.partial().optional(),
    cement: cementSchema.partial().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'At least one section must be provided' });
export type QualificationInput = z.infer<typeof qualificationInputSchema>;

// Parse whatever is stored (may be null / legacy) into a fully-defaulted record.
export function parseQualification(raw: unknown): Qualification {
  const result = qualificationSchema.safeParse(raw ?? {});
  return result.success ? result.data : qualificationSchema.parse({});
}

// ---------------------------------------------------------------------------
// Scoring + master verdict
// ---------------------------------------------------------------------------
export interface QualScores {
  t1: number; // Demand Gate passes (0-5)
  t2: number; // Opportunity Qualifier passes (0-10)
  t3: number; // Forecast Commit Gate passes (0-5)
  icp: number; // ICP matrix total (0-100)
}

export function scoreQualification(q: Qualification): QualScores {
  const dg = q.attract.demandGate;
  const t2 = q.execute.tier2;
  const t3 = q.execute.tier3;
  const icp = q.attract.icp;
  const countPass = (obj: Record<string, GateItem>) =>
    Object.values(obj).filter((g) => g?.pass).length;
  return {
    t1: countPass(dg as Record<string, GateItem>),
    t2: countPass(t2 as Record<string, GateItem>),
    t3: countPass(t3 as Record<string, GateItem>),
    icp:
      icp.budgetAuthority +
      icp.painIntensity +
      icp.strategicFit +
      icp.timelineDecision +
      icp.competitorExposure,
  };
}

export const VERDICTS = [
  'disqualified',
  'pipeline_only',
  'pipeline_plus',
  'best_case',
  'commit_forecast',
] as const;
export type Verdict = (typeof VERDICTS)[number];

export const VERDICT_LABEL: Record<Verdict, string> = {
  disqualified: 'Disqualified',
  pipeline_only: 'Pipeline Only',
  pipeline_plus: 'Pipeline+',
  best_case: 'Best Case',
  commit_forecast: 'Commit Forecast',
};

// Verdict drives the weighted forecast (overrides the raw stage probability).
export const VERDICT_PROBABILITY: Record<Verdict, number> = {
  disqualified: 0,
  pipeline_only: 10,
  pipeline_plus: 30,
  best_case: 60,
  commit_forecast: 90,
};

// Master Qualification Verdict — exactly the framework's thresholds.
export function computeVerdict(q: Qualification): { verdict: Verdict; scores: QualScores } {
  const s = scoreQualification(q);
  let verdict: Verdict;
  if (s.t1 < 4) verdict = 'disqualified';
  else if (s.t2 < 5) verdict = 'pipeline_only';
  else if (s.t2 <= 6) verdict = 'pipeline_plus';
  else if (s.t2 <= 9 || s.t3 < 5) verdict = 'best_case';
  else if (s.t1 >= 4 && s.t2 === 10 && s.t3 === 5) verdict = 'commit_forecast';
  else verdict = 'best_case';
  return { verdict, scores: s };
}

// CEMENT live score: completed actions / total defined actions (0-100).
export function cementScore(q: Qualification): { done: number; total: number; pct: number } {
  let done = 0;
  let total = 0;
  for (const layer of CEMENT_LAYERS) {
    const stored = (q.cement as Record<string, Record<string, boolean>>)[layer.key] ?? {};
    for (const action of layer.actions) {
      total += 1;
      if (stored[action.key]) done += 1;
    }
  }
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
}

// ---------------------------------------------------------------------------
// Stage gates — "never advance past a gate failure"
// ---------------------------------------------------------------------------
// Forward stage order for the ignite_apex framework. closed_lost is reachable
// from anywhere (a deal can always be walked away from / lost).
export const IGNITE_STAGE_ORDER = [
  'ignite',
  'attract',
  'probe',
  'execute',
  'commit',
  'closed_won',
] as const;

export interface GateResult {
  ok: boolean;
  requirement?: string; // what must be true to ENTER the stage
  reason?: string; // why it currently fails
}

// The gate that guards ENTRY into a given stage.
function gateForStage(stage: string, q: Qualification): GateResult {
  const s = scoreQualification(q);
  switch (stage) {
    case 'attract': {
      const ig = q.ignite;
      const ok =
        ig.trigger.trim().length >= 30 &&
        ig.mindsetMissionary &&
        ig.mindsetIcpConfirmed &&
        ig.reframeOpener.trim().length >= 40 &&
        ig.convictionSignal.trim().length > 0;
      return {
        ok,
        requirement:
          'IGNITE complete: trigger (≥30 chars), both mindset checks, reframe opener (≥40 chars), and a logged conviction signal',
        reason: ok ? undefined : 'IGNITE preparation is incomplete — never contact before a confirmed trigger',
      };
    }
    case 'probe': {
      const ok = s.t1 >= 4 && s.icp >= 70;
      return {
        ok,
        requirement: 'ATTRACT passed: Demand Gate ≥4/5 AND ICP score ≥70/100',
        reason: ok
          ? undefined
          : `Demand Gate ${s.t1}/5 (need ≥4), ICP ${s.icp}/100 (need ≥70) — qualify or walk away`,
      };
    }
    case 'execute': {
      const p = q.probe;
      const ok =
        p.rootCause.l1Symptom.trim().length > 0 &&
        p.rootCause.l2Structural.trim().length > 0 &&
        p.rootCause.l3Root.trim().length > 0 &&
        p.ladder.pain.trim().length > 0 &&
        p.ladder.impact.trim().length > 0 &&
        p.ladder.roi.trim().length > 0 &&
        p.champion.name.trim().length > 0;
      return {
        ok,
        requirement:
          'PROBE complete: all 3 root-cause layers, the Pain→Impact→ROI ladder, and a named champion',
        reason: ok ? undefined : 'Diagnosis incomplete — you cannot qualify what you have not diagnosed',
      };
    }
    case 'commit': {
      const ok = s.t1 >= 4 && s.t2 === 10 && s.t3 === 5;
      return {
        ok,
        requirement: 'COMMIT FORECAST verdict: T1 ≥4/5 AND T2 10/10 AND T3 5/5',
        reason: ok
          ? undefined
          : `T1 ${s.t1}/5, T2 ${s.t2}/10, T3 ${s.t3}/5 — never commit a deal that has not passed every Tier-3 gate`,
      };
    }
    case 'closed_won': {
      const ok = s.t1 >= 4 && s.t2 === 10 && s.t3 === 5;
      return {
        ok,
        requirement: 'Deal must be at COMMIT FORECAST before it can be won',
        reason: ok ? undefined : 'Close only commit-grade forecast deals',
      };
    }
    default:
      return { ok: true };
  }
}

// Evaluate whether an ignite_apex opportunity may move from → to. Backward
// moves and closed_lost are always allowed; forward moves must clear every
// intervening gate (you cannot skip a stage). Returns ok for other frameworks.
export function evaluateStageAdvance(
  framework: string,
  from: string,
  to: string,
  q: Qualification,
): GateResult {
  if (framework !== 'ignite_apex') return { ok: true };
  if (to === 'closed_lost' || to === from) return { ok: true };
  const order = IGNITE_STAGE_ORDER as readonly string[];
  const toIdx = order.indexOf(to);
  const fromIdx = order.indexOf(from);
  if (toIdx === -1) return { ok: true }; // unknown target — don't block
  if (fromIdx !== -1 && toIdx <= fromIdx) return { ok: true }; // backward / lateral correction
  for (let i = 1; i <= toIdx; i += 1) {
    const gate = gateForStage(order[i], q);
    if (!gate.ok) return gate;
  }
  return { ok: true };
}
