// Sales-framework registry. A company runs exactly one framework (Company.
// salesFramework); it decides the opportunity pipeline stages, their default
// probabilities, and whether the IGNITE-APEX qualification gates apply.
//
//   general    — the default software-sales pipeline (unchanged, ungated)
//   ignite_apex — the IGNITE-APEX demand-gen Sales OS (gated, qualification-driven)

export const SALES_FRAMEWORKS = ['general', 'ignite_apex'] as const;
export type SalesFramework = (typeof SALES_FRAMEWORKS)[number];

export const DEFAULT_FRAMEWORK: SalesFramework = 'general';

export interface StageDef {
  id: string;
  label: string;
  probability: number; // default weighted-forecast probability for the stage
  open: boolean; // open (in-pipeline) vs closed (won/lost)
}

export interface FrameworkDef {
  id: SalesFramework;
  label: string;
  description: string;
  stages: StageDef[];
}

export const FRAMEWORKS: Record<SalesFramework, FrameworkDef> = {
  general: {
    id: 'general',
    label: 'General software sales',
    description: 'Classic pipeline: new → qualified → proposal → negotiation → closed.',
    stages: [
      { id: 'new', label: 'New', probability: 10, open: true },
      { id: 'qualified', label: 'Qualified', probability: 30, open: true },
      { id: 'proposal', label: 'Proposal', probability: 50, open: true },
      { id: 'negotiation', label: 'Negotiation', probability: 70, open: true },
      { id: 'closed_won', label: 'Closed Won', probability: 100, open: false },
      { id: 'closed_lost', label: 'Closed Lost', probability: 0, open: false },
    ],
  },
  ignite_apex: {
    id: 'ignite_apex',
    label: 'IGNITE-APEX Sales OS',
    description:
      'Demand-generation Sales OS: IGNITE → ATTRACT → PROBE → EXECUTE → COMMIT → close, with hard qualification gates and CEMENT post-sale.',
    stages: [
      { id: 'ignite', label: 'IGNITE', probability: 5, open: true },
      { id: 'attract', label: 'ATTRACT', probability: 20, open: true },
      { id: 'probe', label: 'PROBE', probability: 40, open: true },
      { id: 'execute', label: 'EXECUTE', probability: 60, open: true },
      { id: 'commit', label: 'COMMIT', probability: 85, open: true },
      { id: 'closed_won', label: 'Closed Won', probability: 100, open: false },
      { id: 'closed_lost', label: 'Closed Lost', probability: 0, open: false },
    ],
  },
};

export function normalizeFramework(value: string | null | undefined): SalesFramework {
  return value && (SALES_FRAMEWORKS as readonly string[]).includes(value)
    ? (value as SalesFramework)
    : DEFAULT_FRAMEWORK;
}

export function getFramework(value: string | null | undefined): FrameworkDef {
  return FRAMEWORKS[normalizeFramework(value)];
}

export function stagesFor(framework: string | null | undefined): string[] {
  return getFramework(framework).stages.map((s) => s.id);
}

export function openStagesFor(framework: string | null | undefined): string[] {
  return getFramework(framework).stages.filter((s) => s.open).map((s) => s.id);
}

export function closedStagesFor(framework: string | null | undefined): string[] {
  return getFramework(framework).stages.filter((s) => !s.open).map((s) => s.id);
}

export function isClosedStageFor(framework: string | null | undefined, stage: string): boolean {
  const def = getFramework(framework).stages.find((s) => s.id === stage);
  return def ? !def.open : false;
}

export function stageProbabilityFor(framework: string | null | undefined, stage: string): number {
  return getFramework(framework).stages.find((s) => s.id === stage)?.probability ?? 0;
}

export function isValidStageFor(framework: string | null | undefined, stage: string): boolean {
  return getFramework(framework).stages.some((s) => s.id === stage);
}

// Every stage id used by any framework (for the lenient Zod enum at the schema
// layer; the service enforces that the stage is valid for the company).
export const ALL_STAGE_IDS: string[] = Array.from(
  new Set(Object.values(FRAMEWORKS).flatMap((f) => f.stages.map((s) => s.id))),
);
