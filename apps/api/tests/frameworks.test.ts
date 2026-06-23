// Unit tests for the sales-framework registry (pure, no DB).
import { describe, it, expect } from 'vitest';
import {
  normalizeFramework,
  stagesFor,
  openStagesFor,
  closedStagesFor,
  isClosedStageFor,
  isValidStageFor,
  stageProbabilityFor,
  getFramework,
} from '../src/modules/opportunities/frameworks';

describe('framework registry', () => {
  it('normalizes unknown / empty frameworks to "general"', () => {
    expect(normalizeFramework(undefined)).toBe('general');
    expect(normalizeFramework('')).toBe('general');
    expect(normalizeFramework('bogus')).toBe('general');
    expect(normalizeFramework('ignite_apex')).toBe('ignite_apex');
  });

  it('general framework has the classic stage set', () => {
    expect(stagesFor('general')).toEqual([
      'new',
      'qualified',
      'proposal',
      'negotiation',
      'closed_won',
      'closed_lost',
    ]);
    expect(openStagesFor('general')).toEqual(['new', 'qualified', 'proposal', 'negotiation']);
    expect(closedStagesFor('general')).toEqual(['closed_won', 'closed_lost']);
  });

  it('ignite_apex framework has the demand-gen stage set', () => {
    expect(stagesFor('ignite_apex')).toEqual([
      'ignite',
      'attract',
      'probe',
      'execute',
      'commit',
      'closed_won',
      'closed_lost',
    ]);
  });

  it('isClosedStageFor distinguishes open vs closed per framework', () => {
    expect(isClosedStageFor('general', 'closed_won')).toBe(true);
    expect(isClosedStageFor('general', 'closed_lost')).toBe(true);
    expect(isClosedStageFor('general', 'qualified')).toBe(false);
    expect(isClosedStageFor('ignite_apex', 'commit')).toBe(false);
    expect(isClosedStageFor('ignite_apex', 'closed_won')).toBe(true);
  });

  it('isValidStageFor rejects cross-framework stages', () => {
    expect(isValidStageFor('general', 'qualified')).toBe(true);
    expect(isValidStageFor('general', 'ignite')).toBe(false); // ignite belongs to the other framework
    expect(isValidStageFor('ignite_apex', 'probe')).toBe(true);
    expect(isValidStageFor('ignite_apex', 'negotiation')).toBe(false);
  });

  it('stageProbabilityFor returns the stage default, 0 for unknown', () => {
    expect(stageProbabilityFor('general', 'closed_won')).toBe(100);
    expect(stageProbabilityFor('general', 'closed_lost')).toBe(0);
    expect(stageProbabilityFor('general', 'nope')).toBe(0);
  });

  it('getFramework exposes a label + description', () => {
    expect(getFramework('ignite_apex').label).toMatch(/IGNITE/i);
    expect(getFramework('general').stages.length).toBeGreaterThan(0);
  });
});
