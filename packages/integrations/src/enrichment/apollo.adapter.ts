// Apollo.io enrichment adapter (live). Selected by the factory only when a real
// APOLLO_API_KEY is present. Uses the People Match + Email Verification endpoints.
import axios, { AxiosError, type AxiosInstance } from 'axios';
import { integrationsConfig } from '../config';
import type {
  EnrichmentAdapter,
  ContactInput,
  EnrichmentResult,
  ValidationResult,
  PeopleSearchFilters,
  PeopleSearchResult,
  ProspectPerson,
} from '../types';

interface ApolloPerson {
  id?: string;
  first_name?: string;
  last_name?: string;
  name?: string;
  title?: string;
  email?: string;
  email_status?: string;
  seniority?: string;
  departments?: string[];
  phone_numbers?: Array<{ sanitized_number?: string }>;
  linkedin_url?: string;
  city?: string;
  state?: string;
  country?: string;
  organization?: {
    name?: string;
    primary_domain?: string;
    estimated_num_employees?: number;
    industry?: string;
  };
}

function sizeBand(employees?: number): string | null {
  if (!employees) return null;
  if (employees <= 10) return '1-10';
  if (employees <= 50) return '11-50';
  if (employees <= 200) return '51-200';
  if (employees <= 500) return '201-500';
  if (employees <= 1000) return '501-1000';
  return '1000+';
}

export class ApolloEnrichmentAdapter implements EnrichmentAdapter {
  public readonly provider = 'apollo';

  private http: AxiosInstance;

  constructor(
    apiKey: string = integrationsConfig.enrichment.apolloApiKey,
    baseURL: string = integrationsConfig.enrichment.apolloBaseUrl,
  ) {
    this.http = axios.create({
      baseURL,
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': apiKey },
      timeout: 15000,
    });
  }

  async enrich(contact: ContactInput): Promise<EnrichmentResult> {
    // Matching by the Apollo person id (when known) is what reveals the email for
    // a prospect that came back "locked" from people search.
    const { data } = await this.http.post('/people/match', {
      id: contact.externalId ?? undefined,
      email: contact.email ?? undefined,
      first_name: contact.firstName ?? undefined,
      last_name: contact.lastName ?? undefined,
      organization_name: contact.company ?? undefined,
      domain: contact.domain ?? undefined,
    });

    const person: ApolloPerson | undefined = data?.person;
    if (!person) {
      return { provider: this.provider, found: false };
    }

    const lockedEmail = !person.email || person.email.includes('email_not_unlocked');
    return {
      provider: this.provider,
      found: true,
      email: lockedEmail ? null : (person.email ?? null),
      emailStatus: lockedEmail ? 'locked' : (person.email_status ?? 'verified'),
      title: person.title ?? null,
      seniority: person.seniority ?? null,
      department: person.departments?.[0] ?? null,
      phone: person.phone_numbers?.[0]?.sanitized_number ?? null,
      linkedinUrl: person.linkedin_url ?? null,
      location: person.city ?? null,
      company: person.organization?.name ?? null,
      companyDomain: person.organization?.primary_domain ?? null,
      companySize: sizeBand(person.organization?.estimated_num_employees),
      industry: person.organization?.industry ?? null,
      raw: person,
    };
  }

  // People search.
  //
  // ENDPOINT: POST /mixed_people/api_search. This REPLACED /mixed_people/search,
  // which Apollo now returns 422 for ("deprecated for API callers"). Caveat:
  // `api_search` is the endpoint Apollo's 422 directs API callers to, but it is
  // not clearly part of Apollo's officially documented/stable public surface —
  // treat it as load-bearing-but-unofficial and re-verify if searches start
  // failing. Array filters go in the QUERY STRING (person_titles[]=...), not the
  // JSON body (a body-only request also 422s).
  //
  // Apollo withholds most emails until a contact is unlocked/enriched, so
  // emailStatus is surfaced and email may be null ("locked") — callers enrich
  // (people/match by id) to reveal it.
  async search(filters: PeopleSearchFilters): Promise<PeopleSearchResult> {
    const page = filters.page ?? 1;
    const perPage = Math.min(filters.perPage ?? 10, 100);

    // Apollo /mixed_people/search. Params are passed as query string (Apollo's
    // search endpoint reads array filters from the query, e.g. person_titles[]).
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('per_page', String(perPage));
    for (const t of filters.titles ?? []) params.append('person_titles[]', t);
    for (const s of filters.seniorities ?? []) params.append('person_seniorities[]', s);
    for (const l of filters.locations ?? []) params.append('person_locations[]', l);
    for (const d of filters.domains ?? []) params.append('q_organization_domains_list[]', d);
    for (const r of filters.employeeRanges ?? []) params.append('organization_num_employees_ranges[]', r);
    if (filters.keywords) params.set('q_keywords', filters.keywords);

    let data: { people?: ApolloPerson[]; pagination?: { page?: number; per_page?: number; total_entries?: number } };
    try {
      const resp = await this.http.post(`/mixed_people/api_search?${params.toString()}`);
      data = resp.data;
    } catch (err) {
      if (err instanceof AxiosError && err.response) {
        const body = err.response.data;
        const detail =
          (body && (body.error || body.message || body.errors)) ?? JSON.stringify(body)?.slice(0, 300);
        throw new Error(`Apollo people search failed (${err.response.status}): ${detail}`);
      }
      throw err;
    }

    // Fail loudly on an unexpected 200 response shape (e.g. Apollo changes the
    // endpoint contract) rather than silently returning zero results, which would
    // masquerade as "no matches". The live adapter never falls back to mock — the
    // factory picks live-vs-mock up front — so throwing surfaces the problem.
    if (!data || !Array.isArray(data.people)) {
      throw new Error(
        'Apollo people search returned an unexpected response shape (missing people[]). ' +
          `The api_search contract may have changed: ${JSON.stringify(data)?.slice(0, 200)}`,
      );
    }

    const rawPeople: ApolloPerson[] = data.people;
    const people: ProspectPerson[] = rawPeople.map((p) => {
      const lockedEmail = !p.email || p.email.includes('email_not_unlocked');
      return {
        externalId: p.id ?? null,
        firstName: p.first_name ?? null,
        lastName: p.last_name ?? null,
        name: p.name ?? `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim(),
        title: p.title ?? null,
        email: lockedEmail ? null : (p.email ?? null),
        emailStatus: lockedEmail ? 'locked' : (p.email_status ?? 'verified'),
        linkedinUrl: p.linkedin_url ?? null,
        seniority: p.seniority ?? null,
        location: [p.city, p.state, p.country].filter(Boolean).join(', ') || null,
        company: p.organization?.name ?? null,
        companyDomain: p.organization?.primary_domain ?? null,
        companySize: sizeBand(p.organization?.estimated_num_employees),
        industry: p.organization?.industry ?? null,
      };
    });

    const pagination = data?.pagination ?? {};
    return {
      provider: this.provider,
      people,
      page: pagination.page ?? page,
      perPage: pagination.per_page ?? perPage,
      total: pagination.total_entries ?? people.length,
    };
  }

  async validate(email: string): Promise<ValidationResult> {
    try {
      const { data } = await this.http.post('/email_verifications', { email });
      const status: string = data?.email_verification?.status ?? 'unknown';
      const deliverable = status === 'verified' || status === 'deliverable';
      return {
        provider: this.provider,
        email,
        valid: status !== 'invalid',
        deliverable,
        reason: status,
      };
    } catch {
      // Fail open on verification errors — never block on a flaky check.
      return { provider: this.provider, email, valid: true, deliverable: true, reason: 'check_failed' };
    }
  }
}
