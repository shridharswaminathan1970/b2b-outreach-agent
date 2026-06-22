// Shared adapter interfaces for external providers (CLAUDE.md Phase 5). Every
// provider implements one of these so callers depend on the interface, not the
// vendor. A `provider` string on results identifies which implementation ran
// ('mock' when no live key is configured).

// ── Email ────────────────────────────────────────────────────────────────────
export interface OutboundMessage {
  to: string;
  from: string;
  subject: string;
  body: string;
  replyTo?: string;
  // Caller correlation id (e.g. our messages.id) echoed where the provider allows.
  referenceId?: string;
}

export interface SendResult {
  provider: string;
  providerMessageId: string;
  accepted: boolean;
}

export interface DeliveryEvent {
  provider: string;
  providerMessageId: string;
  eventType: 'sent' | 'delivered' | 'open' | 'click' | 'bounce' | 'complaint' | 'unsubscribe';
  bounceType?: 'hard' | 'soft';
  eventAt: Date;
}

export interface EmailAdapter {
  readonly provider: string;
  send(message: OutboundMessage): Promise<SendResult>;
  getDeliveryEvents(providerMessageId: string): Promise<DeliveryEvent[]>;
}

// ── Enrichment ───────────────────────────────────────────────────────────────
export interface ContactInput {
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
  domain?: string | null;
  linkedinUrl?: string | null;
  // Provider person id (e.g. Apollo id) — the most reliable way to enrich/unlock
  // a prospect found via people search, which often has no email yet.
  externalId?: string | null;
}

export interface EnrichmentResult {
  provider: string;
  found: boolean;
  // The (now-unlocked) email + its status, when the provider reveals it.
  email?: string | null;
  emailStatus?: string | null; // e.g. 'verified' | 'locked' | 'unavailable'
  title?: string | null;
  seniority?: string | null;
  department?: string | null;
  phone?: string | null;
  linkedinUrl?: string | null;
  location?: string | null;
  company?: string | null;
  companyDomain?: string | null;
  companySize?: string | null;
  industry?: string | null;
  raw?: unknown;
}

export interface ValidationResult {
  provider: string;
  email: string;
  valid: boolean;
  deliverable: boolean;
  reason?: string;
}

// People search (prospecting). Filters map to a provider's people-search API.
export interface PeopleSearchFilters {
  titles?: string[]; // job titles e.g. ["Head of Operations","VP Sales"]
  keywords?: string; // free-text keyword query
  domains?: string[]; // company domains to target
  locations?: string[]; // person/company locations
  seniorities?: string[]; // e.g. owner, founder, c_suite, vp, director, manager
  employeeRanges?: string[]; // headcount ranges, e.g. "1,10" "11,50" "51,200"
  page?: number;
  perPage?: number;
}

// A single prospect returned by a people search. Note: providers frequently
// withhold the email until it is "unlocked"/enriched — emailStatus reflects that.
export interface ProspectPerson {
  externalId?: string | null; // provider's person id
  firstName?: string | null;
  lastName?: string | null;
  name: string;
  title?: string | null;
  email?: string | null;
  emailStatus?: string | null; // e.g. 'verified' | 'locked' | 'unavailable'
  linkedinUrl?: string | null;
  seniority?: string | null;
  location?: string | null;
  company?: string | null;
  companyDomain?: string | null;
  companySize?: string | null;
  industry?: string | null;
}

export interface PeopleSearchResult {
  provider: string;
  people: ProspectPerson[];
  page: number;
  perPage: number;
  total: number;
}

export interface EnrichmentAdapter {
  readonly provider: string;
  enrich(contact: ContactInput): Promise<EnrichmentResult>;
  validate(email: string): Promise<ValidationResult>;
  search(filters: PeopleSearchFilters): Promise<PeopleSearchResult>;
}

// ── CRM ──────────────────────────────────────────────────────────────────────
export interface CrmContact {
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
  title?: string | null;
  // Existing CRM id, if known (for upsert).
  crmId?: string | null;
}

export interface CrmActivity {
  crmContactId: string;
  type: 'email_sent' | 'email_replied' | 'meeting_booked' | 'note';
  subject?: string;
  body?: string;
  occurredAt?: Date;
}

export interface CrmTask {
  crmContactId: string;
  title: string;
  dueAt?: Date;
  notes?: string;
}

export interface CrmAdapter {
  readonly provider: string;
  upsertContact(contact: CrmContact): Promise<string>; // returns CRM contact id
  createActivity(activity: CrmActivity): Promise<string>;
  createTask(task: CrmTask): Promise<string>;
}
