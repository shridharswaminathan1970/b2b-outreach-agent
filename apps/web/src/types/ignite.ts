// Frontend shapes for the IGNITE-APEX Sales OS (mirrors the API's opportunities
// qualification/report payloads). Kept loose where the backend owns the detail.

export interface StageDef {
  id: string;
  label: string;
  probability: number;
  open: boolean;
}

export interface FrameworkDef {
  id: string;
  label: string;
  description: string;
  stages: StageDef[];
}

export interface CementActionDef {
  key: string;
  label: string;
}
export interface CementLayerDef {
  key: string;
  label: string;
  months: string;
  actions: CementActionDef[];
}

export interface OpportunitiesMeta {
  activeFramework: string;
  frameworks: FrameworkDef[];
  cementLayers: CementLayerDef[];
  entryPoints: string[];
  verdicts: { id: string; label: string }[];
}

export interface GateItem {
  pass: boolean;
  evidence: string;
}

export interface Qualification {
  ignite: {
    mindsetMissionary: boolean;
    mindsetIcpConfirmed: boolean;
    trigger: string;
    research: {
      strategicPriorities: string;
      individual: string;
      competitivePressure: string;
      peerReference: string;
    };
    educationWeapon: boolean;
    reframeOpener: string;
    entryPoint: string | null;
    sequence: Record<string, { done: boolean; note: string }>;
    signals: string[];
    valueDeposits: string[];
    convictionSignal: string;
    escalationAsk: string;
    escalationResponse: string;
  };
  attract: {
    demandGate: Record<string, GateItem>;
    icp: Record<string, number>;
  };
  probe: {
    rootCause: { l1Symptom: string; l2Structural: string; l3Root: string };
    ladder: { pain: string; impact: string; roi: string };
    champion: { name: string; role: string };
    veto: { name: string; role: string; concern: string; mitigation: string };
    closingTechnique: string;
  };
  execute: {
    tier2: Record<string, GateItem>;
    tier3: Record<string, GateItem>;
  };
  cement: Record<string, Record<string, boolean>>;
}

export interface QualScores {
  t1: number;
  t2: number;
  t3: number;
  icp: number;
}

export interface GateStatus {
  stage: string;
  ok: boolean;
  requirement?: string;
  reason?: string;
}

export interface QualificationView {
  opportunity: import('./api').Opportunity;
  framework: string;
  stage: string;
  qualification: Qualification;
  scores: QualScores;
  verdict: string;
  verdictLabel: string;
  cement: { done: number; total: number; pct: number };
  gates: GateStatus[];
}

// Next-best-action recommendation (works for both frameworks).
export interface NextActionRec {
  action: string;
  rationale: string;
  priority: 'high' | 'medium' | 'low';
  category: string;
  script?: string | null;
}

export interface RecommendationListItem {
  id: string;
  name: string;
  stage: string;
  verdict: string | null;
  amount: number | null;
  contact: string | null;
  account: string | null;
  daysSinceUpdate: number;
  recommendation: NextActionRec;
}

export interface RecommendationList {
  framework: string;
  items: RecommendationListItem[];
}

export interface DealRecommendation {
  opportunityId: string;
  daysSinceUpdate: number;
  recommendation: NextActionRec;
}

// The 9-section deal report (rendered as-is; loose typing).
export interface DealReport {
  generatedAt: string;
  executiveSummary: {
    dealName: string;
    company: string | null;
    contact: string | null;
    owner: string | null;
    stage: string;
    verdict: string;
    verdictLabel: string;
    amount: number | null;
    currency: string;
    probability: number;
    expectedCloseDate: string | null;
    scores: QualScores;
    cementPct: number;
  };
  ignite: Record<string, unknown>;
  attract: {
    demandGate: { key: string; label: string; pass: boolean; evidence: string }[];
    demandGateScore: number;
    icp: { key: string; label: string; score: number }[];
    icpTotal: number;
  };
  probe: Qualification['probe'];
  qualification: {
    tier1: { key: string; label: string; pass: boolean; evidence: string }[];
    tier2: { key: string; label: string; pass: boolean; evidence: string }[];
    tier3: { key: string; label: string; pass: boolean; evidence: string }[];
    scores: QualScores;
  };
  cement: {
    score: { done: number; total: number; pct: number };
    layers: {
      key: string;
      label: string;
      months: string;
      actions: { key: string; label: string; done: boolean }[];
    }[];
  };
  recommendations: string[];
  nextStepScripts: { situation: string; label: string; script: string }[];
  slides: { title: string; bullets: string[] }[];
}
