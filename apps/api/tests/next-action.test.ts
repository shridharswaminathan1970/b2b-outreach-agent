// Unit tests for the deterministic next-best-action recommender (pure, no DB).
import { describe, it, expect } from 'vitest';
import { recommendFor, priorityRank } from '../src/modules/opportunities/nextAction';
import { parseQualification } from '../src/modules/opportunities/qualification';

describe('recommendFor — general framework', () => {
  it('maps each open stage to its playbook action', () => {
    expect(recommendFor({ framework: 'general', stage: 'new', daysSinceUpdate: 0 }).category).toBe('qualify');
    expect(recommendFor({ framework: 'general', stage: 'qualified', daysSinceUpdate: 0 }).category).toBe('propose');
    expect(recommendFor({ framework: 'general', stage: 'proposal', daysSinceUpdate: 0 }).category).toBe('follow_up');
    expect(recommendFor({ framework: 'general', stage: 'negotiation', daysSinceUpdate: 0 }).category).toBe('close');
  });

  it('returns a no-op for closed deals', () => {
    const rec = recommendFor({ framework: 'general', stage: 'closed_won', daysSinceUpdate: 3 });
    expect(rec.category).toBe('none');
    expect(rec.priority).toBe('low');
  });
});

describe('recommendFor — ignite_apex framework', () => {
  it('recommends unblocking the next gate when blocked', () => {
    const rec = recommendFor({
      framework: 'ignite_apex',
      stage: 'ignite',
      daysSinceUpdate: 0,
      qualification: parseQualification({}), // nothing filled → ATTRACT gate blocked
    });
    expect(rec.category).toBe('qualify');
    expect(rec.action.toLowerCase()).toContain('attract');
  });

  it('recommends advancing when the next gate is satisfied', () => {
    const ready = parseQualification({
      ignite: {
        trigger: 'They lost their biggest account to a faster rival last quarter for sure',
        mindsetMissionary: true,
        mindsetIcpConfirmed: true,
        reframeOpener: 'Most teams misread this as a tooling gap when it is decision latency',
        convictionSignal: 'VP said this cannot continue',
      },
    });
    const rec = recommendFor({ framework: 'ignite_apex', stage: 'ignite', daysSinceUpdate: 0, qualification: ready });
    expect(rec.category).toBe('advance');
    expect(rec.action.toLowerCase()).toContain('attract');
  });
});

describe('recency overlay', () => {
  it('escalates a stale open deal to high priority with a re-engage action', () => {
    const fresh = recommendFor({ framework: 'general', stage: 'qualified', daysSinceUpdate: 1 });
    const stale = recommendFor({ framework: 'general', stage: 'qualified', daysSinceUpdate: 10 });
    expect(stale.priority).toBe('high');
    expect(stale.action.toLowerCase()).toContain('re-engage');
    expect(fresh.action.toLowerCase()).not.toContain('re-engage');
  });
});

describe('priorityRank', () => {
  it('orders high > medium > low', () => {
    expect(priorityRank('high')).toBeGreaterThan(priorityRank('medium'));
    expect(priorityRank('medium')).toBeGreaterThan(priorityRank('low'));
  });
});
