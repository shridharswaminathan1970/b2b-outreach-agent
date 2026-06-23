// Unit tests for IGNITE-APEX qualification scoring, master verdict, stage gates,
// and CEMENT score (pure, no DB).
import { describe, it, expect } from 'vitest';
import {
  parseQualification,
  scoreQualification,
  computeVerdict,
  evaluateStageAdvance,
  cementScore,
  type Qualification,
} from '../src/modules/opportunities/qualification';

// Build a qualification with N passing gate items keyed q1..qN / t1..tN etc.
function passes(prefix: string, n: number, count: number): Record<string, { pass: boolean; evidence: string }> {
  const out: Record<string, { pass: boolean; evidence: string }> = {};
  for (let i = 1; i <= n; i += 1) out[`${prefix}${i}`] = { pass: i <= count, evidence: i <= count ? 'ev' : '' };
  return out;
}

// Compose a full qualification from desired scores. icp spread across 5 criteria.
function build(opts: {
  t1?: number; // demand gate passes (0-5)
  t2?: number; // tier-2 passes (0-10)
  t3?: number; // tier-3 passes (0-5)
  icp?: number; // 0-100
  ignite?: Partial<Qualification['ignite']>;
  probe?: Partial<Qualification['probe']>;
}): Qualification {
  const icpEach = Math.floor((opts.icp ?? 0) / 5);
  const icpRemainder = (opts.icp ?? 0) - icpEach * 5;
  const q = parseQualification({
    ignite: opts.ignite ?? {},
    attract: {
      demandGate: passes('tg', 5, opts.t1 ?? 0),
      icp: {
        budgetAuthority: icpEach + icpRemainder,
        painIntensity: icpEach,
        strategicFit: icpEach,
        timelineDecision: icpEach,
        competitorExposure: icpEach,
      },
    },
    probe: opts.probe ?? {},
    execute: {
      tier2: passes('q', 10, opts.t2 ?? 0),
      tier3: passes('t', 5, opts.t3 ?? 0),
    },
  });
  return q;
}

describe('scoreQualification', () => {
  it('counts passing gates and sums the ICP matrix', () => {
    const s = scoreQualification(build({ t1: 4, t2: 7, t3: 2, icp: 80 }));
    expect(s).toEqual({ t1: 4, t2: 7, t3: 2, icp: 80 });
  });
});

describe('computeVerdict — master qualification thresholds', () => {
  it('DISQUALIFIED when demand gate < 4/5', () => {
    expect(computeVerdict(build({ t1: 3, t2: 10, t3: 5 })).verdict).toBe('disqualified');
  });

  it('PIPELINE ONLY when T1>=4 but T2 < 5/10', () => {
    expect(computeVerdict(build({ t1: 4, t2: 4 })).verdict).toBe('pipeline_only');
  });

  it('PIPELINE+ when T2 is 5-6/10', () => {
    expect(computeVerdict(build({ t1: 4, t2: 5 })).verdict).toBe('pipeline_plus');
    expect(computeVerdict(build({ t1: 4, t2: 6 })).verdict).toBe('pipeline_plus');
  });

  it('BEST CASE when T2 is 7-9/10, or T2=10 but T3 incomplete', () => {
    expect(computeVerdict(build({ t1: 4, t2: 7 })).verdict).toBe('best_case');
    expect(computeVerdict(build({ t1: 4, t2: 9 })).verdict).toBe('best_case');
    expect(computeVerdict(build({ t1: 4, t2: 10, t3: 4 })).verdict).toBe('best_case');
  });

  it('COMMIT FORECAST only when T1>=4 AND T2=10 AND T3=5', () => {
    expect(computeVerdict(build({ t1: 4, t2: 10, t3: 5 })).verdict).toBe('commit_forecast');
    expect(computeVerdict(build({ t1: 5, t2: 10, t3: 5 })).verdict).toBe('commit_forecast');
  });
});

describe('evaluateStageAdvance — gates', () => {
  const fullIgnite = {
    trigger: 'They just lost their biggest account to a faster competitor last quarter',
    mindsetMissionary: true,
    mindsetIcpConfirmed: true,
    reframeOpener: 'Most teams misread this as a tooling gap when it is really decision latency',
    convictionSignal: 'VP said this cannot continue another quarter',
  };
  const fullProbe = {
    rootCause: { l1Symptom: 'stalls', l2Structural: 'no MSA', l3Root: 'nobody owns templating' },
    ladder: { pain: 'slow', impact: '$1.2M/q', roi: '$4M/yr' },
    champion: { name: 'Priya', role: 'VP RevOps' },
  };

  it('general framework is never gated', () => {
    const res = evaluateStageAdvance('general', 'new', 'closed_won', parseQualification({}));
    expect(res.ok).toBe(true);
  });

  it('blocks ignite -> attract until IGNITE prep is complete', () => {
    const empty = parseQualification({});
    expect(evaluateStageAdvance('ignite_apex', 'ignite', 'attract', empty).ok).toBe(false);
    const ready = build({ ignite: fullIgnite });
    expect(evaluateStageAdvance('ignite_apex', 'ignite', 'attract', ready).ok).toBe(true);
  });

  it('blocks advance to probe until demand gate >=4 AND ICP >=70', () => {
    const ig = build({ ignite: fullIgnite, t1: 3, icp: 90 });
    expect(evaluateStageAdvance('ignite_apex', 'attract', 'probe', ig).ok).toBe(false); // gate too low
    const lowIcp = build({ ignite: fullIgnite, t1: 5, icp: 60 });
    expect(evaluateStageAdvance('ignite_apex', 'attract', 'probe', lowIcp).ok).toBe(false); // icp too low
    const ok = build({ ignite: fullIgnite, t1: 4, icp: 70 });
    expect(evaluateStageAdvance('ignite_apex', 'attract', 'probe', ok).ok).toBe(true);
  });

  it('blocks commit until T1>=4, T2=10, T3=5', () => {
    const notReady = build({ ignite: fullIgnite, probe: fullProbe, t1: 4, t2: 10, t3: 4, icp: 80 });
    expect(evaluateStageAdvance('ignite_apex', 'execute', 'commit', notReady).ok).toBe(false);
    const ready = build({ ignite: fullIgnite, probe: fullProbe, t1: 4, t2: 10, t3: 5, icp: 80 });
    expect(evaluateStageAdvance('ignite_apex', 'execute', 'commit', ready).ok).toBe(true);
  });

  it('always allows closed_lost and backward/lateral moves', () => {
    const empty = parseQualification({});
    expect(evaluateStageAdvance('ignite_apex', 'probe', 'closed_lost', empty).ok).toBe(true);
    expect(evaluateStageAdvance('ignite_apex', 'probe', 'attract', empty).ok).toBe(true); // backward
    expect(evaluateStageAdvance('ignite_apex', 'probe', 'probe', empty).ok).toBe(true); // lateral
  });
});

describe('cementScore', () => {
  it('is 0% on an empty record and rounds the completed ratio', () => {
    expect(cementScore(parseQualification({})).pct).toBe(0);
    const q = parseQualification({ cement: { l1: { firstValueConfirmed: true } } });
    const score = cementScore(q);
    expect(score.done).toBe(1);
    expect(score.total).toBeGreaterThanOrEqual(15);
    expect(score.pct).toBe(Math.round((score.done / score.total) * 100));
  });
});

describe('parseQualification', () => {
  it('returns a fully-defaulted record for null/garbage input', () => {
    const q = parseQualification(null);
    expect(q.attract.demandGate.tg1.pass).toBe(false);
    expect(q.execute.tier2.q1.pass).toBe(false);
    expect(scoreQualification(q)).toEqual({ t1: 0, t2: 0, t3: 0, icp: 0 });
  });
});
