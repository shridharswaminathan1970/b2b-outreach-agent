// Deterministic next-best-action recommender. Decides the single most useful
// next step for an opportunity from its stage / verdict / qualification gaps /
// recency — cheap and reliable, no AI call. The AI layer (recommendNextAction)
// later turns the chosen action into a ready-to-use script.
import {
  IGNITE_STAGE_ORDER,
  evaluateStageAdvance,
  scoreQualification,
  type Qualification,
} from './qualification';
import { isClosedStageFor, getFramework, stageProbabilityFor } from './frameworks';

export type Priority = 'high' | 'medium' | 'low';

export interface NextActionRec {
  action: string;
  rationale: string;
  priority: Priority;
  category: string;
}

const GENERAL_PLAYBOOK: Record<string, NextActionRec> = {
  new: {
    action: 'Qualify the opportunity',
    rationale: 'Confirm need, budget, authority and timing before investing more cycles.',
    priority: 'medium',
    category: 'qualify',
  },
  qualified: {
    action: 'Send a proposal',
    rationale: 'The deal is qualified — put a concrete proposal in front of the buyer.',
    priority: 'medium',
    category: 'propose',
  },
  proposal: {
    action: 'Follow up on the proposal',
    rationale: 'Chase a decision and surface any objections holding it up.',
    priority: 'high',
    category: 'follow_up',
  },
  negotiation: {
    action: 'Confirm terms and ask for the close',
    rationale: 'In negotiation — lock terms and drive to a signature.',
    priority: 'high',
    category: 'close',
  },
};

// IGNITE-APEX: the next action is whatever unblocks the next stage gate.
function igniteAction(stage: string, qual: Qualification): NextActionRec {
  const order = IGNITE_STAGE_ORDER as readonly string[];
  const idx = order.indexOf(stage);
  const nextStage = idx >= 0 && idx < order.length - 1 ? order[idx + 1] : null;
  const s = scoreQualification(qual);

  if (!nextStage) {
    return {
      action: 'Advance to close',
      rationale: 'Commit-grade deal — move it to Closed Won.',
      priority: 'high',
      category: 'close',
    };
  }

  const gate = evaluateStageAdvance('ignite_apex', stage, nextStage, qual);
  if (gate.ok) {
    return {
      action: `Advance to ${nextStage.toUpperCase()}`,
      rationale: `The gate for ${nextStage.toUpperCase()} is satisfied — progress the deal.`,
      priority: nextStage === 'commit' || nextStage === 'closed_won' ? 'high' : 'medium',
      category: 'advance',
    };
  }

  // Blocked — the action is to satisfy the failing gate. Priority rises with stage.
  const lateStage = stage === 'execute' || stage === 'commit';
  const demandRisk = s.t1 < 4;
  return {
    action: `Unblock ${nextStage.toUpperCase()}: ${gate.requirement ?? 'complete the gate'}`,
    rationale: gate.reason ?? 'Complete the qualification work this stage requires.',
    priority: demandRisk || lateStage ? 'high' : 'medium',
    category: 'qualify',
  };
}

export function recommendFor(params: {
  framework: string;
  stage: string;
  verdict?: string | null;
  daysSinceUpdate: number;
  qualification?: Qualification | null;
}): NextActionRec {
  const { framework, stage, daysSinceUpdate, qualification } = params;

  // Closed deals need no action.
  if (isClosedStageFor(framework, stage)) {
    return {
      action: 'No action — deal closed',
      rationale: 'This opportunity is closed.',
      priority: 'low',
      category: 'none',
    };
  }

  let rec: NextActionRec =
    framework === 'ignite_apex' && qualification
      ? igniteAction(stage, qualification)
      : GENERAL_PLAYBOOK[stage] ?? {
          action: 'Review the opportunity',
          rationale: 'No standard play for this stage — review and decide the next step.',
          priority: 'medium',
          category: 'review',
        };

  // Recency overlay: a stale open deal needs re-engaging, and it's urgent.
  if (daysSinceUpdate >= 7) {
    rec = {
      ...rec,
      action: `Re-engage — ${rec.action.toLowerCase()}`,
      rationale: `No activity in ${daysSinceUpdate} days. ${rec.rationale}`,
      priority: 'high',
    };
  }

  return rec;
}

// Used to sort the dashboard list: priority desc, then probability-ish weight.
export function priorityRank(p: Priority): number {
  return p === 'high' ? 3 : p === 'medium' ? 2 : 1;
}

// Re-export for callers building a list view label.
export function stageWeight(framework: string, stage: string): number {
  return getFramework(framework).stages.find((s) => s.id === stage)
    ? stageProbabilityFor(framework, stage)
    : 0;
}
