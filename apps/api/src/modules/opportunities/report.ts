// IGNITE-APEX deal-briefing REPORT generator (the 9-section briefing). Sections
// 1-7 and 9 are assembled deterministically from the stored qualification data;
// section 8 (next-step scripts) is AI-generated from the diagnosis. The frontend
// renders this JSON and can print it to PDF.
import { generateNextStepScripts, productContextFrom } from '@outreach/ai';
import {
  parseQualification,
  scoreQualification,
  computeVerdict,
  cementScore,
  VERDICT_LABEL,
  DEMAND_GATE_QUESTIONS,
  ICP_CRITERIA,
  TIER2_QUESTIONS,
  TIER3_QUESTIONS,
  CEMENT_LAYERS,
  type GateItem,
  type Qualification,
} from './qualification';

interface OppForReport {
  id: string;
  name: string;
  stage: string;
  amount: unknown;
  currency: string;
  probability: number;
  expectedCloseDate: Date | null;
  qualificationJson: unknown;
  contact?: { name: string | null; email: string | null } | null;
  account?: { name: string | null } | null;
  owner?: { name: string | null } | null;
}

function gateRows(obj: Record<string, GateItem>, labels: readonly { key: string; label: string }[]) {
  return labels.map(({ key, label }) => ({
    key,
    label,
    pass: Boolean(obj[key]?.pass),
    evidence: obj[key]?.evidence ?? '',
  }));
}

// Derive the actionable gaps (section 7): unmet gates + missing critical fields.
function recommendations(q: Qualification): string[] {
  const s = scoreQualification(q);
  const gaps: string[] = [];
  if (s.t1 < 4) gaps.push(`Demand Gate is ${s.t1}/5 — needs ≥4 to qualify (currently DISQUALIFIED).`);
  if (s.icp < 70) gaps.push(`ICP score is ${s.icp}/100 — needs ≥70 to advance past ATTRACT.`);
  if (!q.probe.rootCause.l3Root.trim()) gaps.push('Layer-3 root cause is blank — capture it in their exact words.');
  if (!q.probe.ladder.impact.trim()) gaps.push('Impact is not quantified — attach a number to the pain.');
  if (!q.probe.ladder.roi.trim()) gaps.push('Year-one ROI is missing — get the buyer to state the value.');
  if (!q.probe.champion.name.trim()) gaps.push('No champion identified — name who spends political capital for you.');
  if (s.t2 < 10) gaps.push(`Opportunity Qualifier is ${s.t2}/10 — close the gaps before committing the forecast.`);
  if (s.t3 < 5) gaps.push(`Forecast Commit Gate is ${s.t3}/5 — all five must pass to commit.`);
  if (gaps.length === 0) gaps.push('No blocking gaps — deal is commit-grade. Maintain CEMENT post-close.');
  return gaps;
}

// Section 9: structured slide layouts (title + bullets) for an exec deck.
function slides(q: Qualification, verdictLabel: string, scores: ReturnType<typeof scoreQualification>) {
  return [
    {
      title: 'The Situation',
      bullets: [
        q.probe.rootCause.l1Symptom || 'Symptom not captured',
        `Root cause: ${q.probe.rootCause.l3Root || 'not captured'}`,
      ],
    },
    {
      title: 'The Cost of Inaction',
      bullets: [q.probe.ladder.impact || 'Impact not quantified', q.probe.ladder.pain || 'Pain not captured'],
    },
    {
      title: 'The Return',
      bullets: [q.probe.ladder.roi || 'ROI not stated', `Qualification: ${verdictLabel}`],
    },
    {
      title: 'Qualification Snapshot',
      bullets: [
        `Demand Gate: ${scores.t1}/5`,
        `ICP: ${scores.icp}/100`,
        `Opportunity Qualifier: ${scores.t2}/10`,
        `Commit Gate: ${scores.t3}/5`,
      ],
    },
  ];
}

export async function buildDealReport(opp: OppForReport, companySettings: unknown) {
  const q = parseQualification(opp.qualificationJson);
  const scores = scoreQualification(q);
  const { verdict } = computeVerdict(q);
  const verdictLabel = VERDICT_LABEL[verdict];
  const product = productContextFrom(companySettings);
  const cement = cementScore(q);

  // Section 8 — AI next-step scripts grounded in the diagnosis.
  const scriptsRes = await generateNextStepScripts({
    contactName: opp.contact?.name ?? opp.name,
    company: opp.account?.name ?? null,
    product,
    verdict: verdictLabel,
    rootCause: q.probe.rootCause,
    pain: q.probe.ladder.pain,
    impact: q.probe.ladder.impact,
    roi: q.probe.ladder.roi,
    championName: q.probe.champion.name || null,
  });

  return {
    generatedAt: new Date().toISOString(),
    // 1 — Executive summary
    executiveSummary: {
      dealName: opp.name,
      company: opp.account?.name ?? null,
      contact: opp.contact?.name ?? null,
      owner: opp.owner?.name ?? null,
      stage: opp.stage,
      verdict,
      verdictLabel,
      amount: opp.amount != null ? Number(opp.amount) : null,
      currency: opp.currency,
      probability: opp.probability,
      expectedCloseDate: opp.expectedCloseDate,
      scores,
      cementPct: cement.pct,
    },
    // 2 — IGNITE record
    ignite: {
      trigger: q.ignite.trigger,
      mindset: {
        missionary: q.ignite.mindsetMissionary,
        icpConfirmed: q.ignite.mindsetIcpConfirmed,
      },
      research: q.ignite.research,
      reframeOpener: q.ignite.reframeOpener,
      entryPoint: q.ignite.entryPoint ?? null,
      sequence: q.ignite.sequence,
      signals: q.ignite.signals,
      valueDeposits: q.ignite.valueDeposits,
      convictionSignal: q.ignite.convictionSignal,
      escalation: { ask: q.ignite.escalationAsk, response: q.ignite.escalationResponse },
    },
    // 3 — ATTRACT (demand gate + ICP)
    attract: {
      demandGate: gateRows(q.attract.demandGate as Record<string, GateItem>, DEMAND_GATE_QUESTIONS),
      demandGateScore: scores.t1,
      icp: ICP_CRITERIA.map(({ key, label }) => ({
        key,
        label,
        score: (q.attract.icp as Record<string, number>)[key] ?? 0,
      })),
      icpTotal: scores.icp,
    },
    // 4 — PROBE diagnosis
    probe: {
      rootCause: q.probe.rootCause,
      ladder: q.probe.ladder,
      champion: q.probe.champion,
      veto: q.probe.veto,
      closingTechnique: q.probe.closingTechnique,
    },
    // 5 — Qualification system (all 20 questions)
    qualification: {
      tier1: gateRows(q.attract.demandGate as Record<string, GateItem>, DEMAND_GATE_QUESTIONS),
      tier2: gateRows(q.execute.tier2 as Record<string, GateItem>, TIER2_QUESTIONS),
      tier3: gateRows(q.execute.tier3 as Record<string, GateItem>, TIER3_QUESTIONS),
      scores,
    },
    // 6 — CEMENT score
    cement: {
      score: cement,
      layers: CEMENT_LAYERS.map((layer) => {
        const stored = (q.cement as Record<string, Record<string, boolean>>)[layer.key] ?? {};
        return {
          key: layer.key,
          label: layer.label,
          months: layer.months,
          actions: layer.actions.map((a) => ({ key: a.key, label: a.label, done: Boolean(stored[a.key]) })),
        };
      }),
    },
    // 7 — Recommendations (gaps)
    recommendations: recommendations(q),
    // 8 — Next-step scripts (AI)
    nextStepScripts: scriptsRes.ok ? scriptsRes.scripts : [],
    // 9 — Slide layouts
    slides: slides(q, verdictLabel, scores),
  };
}
