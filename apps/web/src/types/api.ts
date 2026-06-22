// Shared API entity types (subset of the backend Prisma models the UI uses).

export interface Campaign {
  id: string;
  name: string;
  status: string;
  objective?: string | null;
  persona?: string | null;
  createdAt: string;
  _count?: { sequences: number; enrollments: number; messages?: number };
}

export interface Contact {
  id: string;
  name: string;
  email: string | null;
  title: string | null;
  status: string;
  icpScore: number;
  enriched: boolean;
  suppressed: boolean;
  account?: { id: string; name: string } | null;
}

export interface Opportunity {
  id: string;
  name: string;
  stage: string;
  amount: string | null;
  currency: string;
  probability: number;
  verdict?: string | null;
  expectedCloseDate: string | null;
  createdAt: string;
  owner?: { id: string; name: string } | null;
  contact?: { id: string; name: string; email: string | null } | null;
}

export interface Draft {
  id: string;
  status: string;
  subject: string | null;
  body: string | null;
  qualityScore: string | null;
  personalizationScore: string | null;
  researchBrief: string | null;
  createdAt: string;
  contact?: { id: string; name: string; email: string | null } | null;
}

export interface Reply {
  id: string;
  classification: string | null;
  confidence: string | null;
  summary: string | null;
  needsHumanReview: boolean;
  handled: boolean;
  handleAction: string | null;
  receivedAt: string;
  contact?: { id: string; name: string; email: string | null } | null;
  message?: { id: string; campaignId: string; subject: string | null } | null;
}

export interface SequenceStep {
  id: string;
  stepOrder: number;
  channel: string;
  delayHours: number;
  delayType: string;
  subject: string | null;
  bodyOverride: string | null;
  templateId: string | null;
  intent: string;
  branding: string;
}

export interface Sequence {
  id: string;
  campaignId: string;
  name: string;
  description: string | null;
  status: string;
  totalSteps: number;
  steps?: SequenceStep[];
  _count?: { steps: number; enrollments: number };
}

export interface ProspectPerson {
  externalId?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  name: string;
  title?: string | null;
  email?: string | null;
  emailStatus?: string | null;
  linkedinUrl?: string | null;
  seniority?: string | null;
  location?: string | null;
  company?: string | null;
  companyDomain?: string | null;
  companySize?: string | null;
  industry?: string | null;
}

export interface ProspectSearchResult {
  provider: string;
  people: ProspectPerson[];
  page: number;
  perPage: number;
  total: number;
  live: boolean;
}

export interface ProspectImportSummary {
  total: number;
  imported: number;
  duplicatesInBatch: number;
  duplicatesInDb: number;
  skippedNoIdentity: number;
  accountsCreated: number;
  createdIds: string[];
}

export interface EnrichBatchSummary {
  requested: number;
  enriched: number;
  emailsUnlocked: number;
  notFound: number;
  failed: number;
}

export interface Company {
  id: string;
  name: string;
  domain: string | null;
  settingsJson: Record<string, unknown> | null;
  salesFramework?: string;
  billingPlan: string | null;
  status: string;
  _count?: { users: number; teams: number };
}

export interface Team {
  id: string;
  name: string;
  department: string | null;
  manager?: { id: string; name: string; email: string } | null;
  teamLead?: { id: string; name: string; email: string } | null;
  _count?: { members: number };
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  teamId: string | null;
  reportsToUserId: string | null;
}

export interface AnalyticsOverview {
  campaigns: { total: number; active: number };
  contacts: { total: number; suppressed: number };
  outreach: {
    sent: number;
    delivered: number;
    opened: number;
    bounced: number;
    replies: number;
    replyRate: number;
    meetingsBooked: number;
    interested: number;
    pipeline: number;
  };
}

export interface Pipeline {
  open: { count: number; value: number };
  weightedForecast: number;
  won: { count: number; value: number };
  lost: { count: number };
  winRate: number;
  byStage: Array<{ stage: string; count: number; value: number }>;
}

export interface AuditLog {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  actorType: string | null;
  actorId: string | null;
  summary: string | null;
  createdAt: string;
}
