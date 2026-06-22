// Mock enrichment adapter: returns deterministic, plausible enrichment derived
// from the input so the enrichment + scoring jobs work end-to-end without an
// Apollo key. Used whenever APOLLO_API_KEY is absent or USE_MOCK_ENRICHMENT=true.
import type {
  EnrichmentAdapter,
  ContactInput,
  EnrichmentResult,
  ValidationResult,
  PeopleSearchFilters,
  PeopleSearchResult,
  ProspectPerson,
} from '../types';

// Infer a coarse seniority from a job title (matches the seed ICP vocabulary).
function inferSeniority(title?: string | null): string {
  const t = (title ?? '').toLowerCase();
  if (/\b(ceo|cto|cfo|coo|chief|founder|owner|president)\b/.test(t)) return 'c_suite';
  if (/\b(vp|vice president|head of)\b/.test(t)) return 'vp';
  if (/\bdirector\b/.test(t)) return 'director';
  if (/\bmanager\b/.test(t)) return 'manager';
  return 'individual_contributor';
}

function domainFromEmail(email?: string | null): string | null {
  if (!email || !email.includes('@')) return null;
  return email.split('@')[1] ?? null;
}

export class MockEnrichmentAdapter implements EnrichmentAdapter {
  public readonly provider = 'mock';

  async enrich(contact: ContactInput): Promise<EnrichmentResult> {
    const domain = contact.domain ?? domainFromEmail(contact.email) ?? 'example.com';
    const title = contact.firstName ? `${contact.firstName === 'Wei Ling' ? 'Dean' : 'Director'} of Operations` : 'Director of Operations';
    // Deterministically "unlock" an email so the enrich flow is demonstrable.
    const first = (contact.firstName ?? 'lead').toLowerCase().replace(/\s+/g, '');
    const last = (contact.lastName ?? 'contact').toLowerCase().replace(/\s+/g, '');
    const email = contact.email ?? `${first}.${last}@${domain}`;
    return {
      provider: this.provider,
      found: true,
      email,
      emailStatus: 'verified',
      title,
      seniority: inferSeniority(title),
      department: 'Operations',
      phone: null,
      linkedinUrl: contact.linkedinUrl ?? null,
      location: 'Unknown',
      company: contact.company ?? (domain ? domain.split('.')[0] : null),
      companyDomain: domain,
      companySize: '51-200',
      industry: 'Software',
      raw: { mock: true },
    };
  }

  async validate(email: string): Promise<ValidationResult> {
    // Simple shape validation; treat well-formed addresses as deliverable.
    const valid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
    return {
      provider: this.provider,
      email,
      valid,
      deliverable: valid,
      reason: valid ? undefined : 'malformed_address',
    };
  }

  // Deterministic fake people search shaped by the filters, so the prospecting
  // flow works end-to-end without an Apollo key.
  async search(filters: PeopleSearchFilters): Promise<PeopleSearchResult> {
    const page = filters.page ?? 1;
    const perPage = Math.min(filters.perPage ?? 10, 50);
    const firstNames = ['Wei', 'Arjun', 'Sara', 'Liam', 'Mei', 'Tariq', 'Nora', 'Diego', 'Yuki', 'Omar'];
    const lastNames = ['Tan', 'Sharma', 'Khan', 'Lopez', 'Chen', 'Patel', 'Kim', 'Silva', 'Ng', 'Ali'];
    const title = filters.titles?.[0] ?? 'Head of Operations';
    const location = filters.locations?.[0] ?? 'Singapore';
    const domains = filters.domains?.length ? filters.domains : ['acme-corp.com', 'novastack.io', 'meridianerp.com'];
    const sizeBands = ['11-50', '51-200', '201-500'];

    const people: ProspectPerson[] = Array.from({ length: perPage }).map((_, i) => {
      const idx = (page - 1) * perPage + i;
      const first = firstNames[idx % firstNames.length];
      const last = lastNames[(idx * 3) % lastNames.length];
      const domain = domains[idx % domains.length];
      const company = domain.split('.')[0].replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      return {
        externalId: `mock-${idx + 1}`,
        firstName: first,
        lastName: last,
        name: `${first} ${last}`,
        title,
        email: `${first.toLowerCase()}.${last.toLowerCase()}@${domain}`,
        emailStatus: 'verified',
        linkedinUrl: `https://www.linkedin.com/in/${first.toLowerCase()}-${last.toLowerCase()}-${idx + 1}`,
        seniority: inferSeniority(title),
        location,
        company,
        companyDomain: domain,
        companySize: filters.employeeRanges?.length ? '51-200' : sizeBands[idx % sizeBands.length],
        industry: 'Software',
      };
    });

    return { provider: this.provider, people, page, perPage, total: 120 };
  }
}
