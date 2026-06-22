// Prospecting business logic: people search via the enrichment adapter (Apollo
// live, or the deterministic mock when no key) + import of selected prospects
// into contacts with company-scoped deduplication (by email or LinkedIn URL).
import { prisma } from '../../config/database';
import { Errors } from '../../utils/response';
import { writeAuditLog } from '../audit/audit.service';
import { type Actor, canWrite } from '../../utils/tenancy';
import { getEnrichmentAdapter, enrichmentIsLive } from '@outreach/integrations';
import type { SearchProspectsInput, ProspectPersonInput } from './prospecting.schema';

export async function searchProspects(input: SearchProspectsInput, actor: Actor) {
  const adapter = getEnrichmentAdapter();
  const result = await adapter.search({
    titles: input.titles,
    keywords: input.keywords,
    domains: input.domains,
    locations: input.locations,
    seniorities: input.seniorities,
    employeeRanges: input.employeeRanges,
    page: input.page,
    perPage: input.perPage,
  });

  await writeAuditLog({
    entityType: 'prospecting',
    entityId: 'search',
    action: 'prospecting.search',
    actorType: 'user',
    actorId: actor.id,
    companyId: actor.companyId,
    summary: `Prospect search (${result.provider}) returned ${result.people.length} of ${result.total}`,
    payload: { filters: input, provider: result.provider, total: result.total },
    ipAddress: actor.ipAddress,
  });

  return { ...result, live: enrichmentIsLive() };
}

// Resolve (or create) an account by name, company-scoped, with a per-call cache.
async function resolveAccountId(
  companyName: string,
  cache: Map<string, string>,
  createdCounter: { count: number },
  actor: Actor,
): Promise<string> {
  const key = companyName.trim().toLowerCase();
  const cached = cache.get(key);
  if (cached) return cached;

  const existing = await prisma.account.findFirst({
    where: { companyId: actor.companyId, name: { equals: companyName.trim(), mode: 'insensitive' } },
    select: { id: true },
  });
  if (existing) {
    cache.set(key, existing.id);
    return existing.id;
  }

  const account = await prisma.account.create({
    data: { name: companyName.trim(), companyId: actor.companyId },
    select: { id: true },
  });
  createdCounter.count += 1;
  cache.set(key, account.id);
  return account.id;
}

export interface ImportSummary {
  total: number;
  imported: number;
  duplicatesInBatch: number;
  duplicatesInDb: number;
  skippedNoIdentity: number;
  accountsCreated: number;
  createdIds: string[]; // ids of the contacts created (for an immediate enrich pass)
}

export async function importProspects(people: ProspectPersonInput[], actor: Actor): Promise<ImportSummary> {
  if (!canWrite(actor.role)) throw Errors.forbidden('Your role may not import prospects');

  const summary: ImportSummary = {
    total: people.length,
    imported: 0,
    duplicatesInBatch: 0,
    duplicatesInDb: 0,
    skippedNoIdentity: 0,
    accountsCreated: 0,
    createdIds: [],
  };

  const emails = people.map((p) => p.email?.toLowerCase()).filter((e): e is string => Boolean(e));
  const urls = people.map((p) => p.linkedinUrl).filter((u): u is string => Boolean(u));
  const externalIds = people.map((p) => p.externalId).filter((e): e is string => Boolean(e));

  // Dedup within the actor's company by email OR LinkedIn URL OR the provider's
  // person id (Apollo withholds email/LinkedIn for locked prospects, so the
  // external id is often the only stable identifier available at search time).
  const existing = await prisma.contact.findMany({
    where: {
      companyId: actor.companyId,
      OR: [
        ...(emails.length ? [{ email: { in: emails } }] : []),
        ...(urls.length ? [{ linkedinUrl: { in: urls } }] : []),
        ...(externalIds.length
          ? [{ externalSource: 'apollo', externalId: { in: externalIds } }]
          : []),
      ],
    },
    select: { email: true, linkedinUrl: true, externalId: true },
  });
  const dbEmails = new Set(existing.map((c) => c.email?.toLowerCase()).filter(Boolean));
  const dbUrls = new Set(existing.map((c) => c.linkedinUrl).filter(Boolean));
  const dbExternalIds = new Set(existing.map((c) => c.externalId).filter(Boolean));
  const seenEmails = new Set<string>();
  const seenUrls = new Set<string>();
  const seenExternalIds = new Set<string>();

  const accountCache = new Map<string, string>();
  const createdCounter = { count: 0 };

  for (const p of people) {
    const email = p.email?.toLowerCase() || null;
    const url = p.linkedinUrl || null;
    const extId = p.externalId || null;

    // Need at least one stable identifier to dedup against.
    if (!email && !url && !extId) {
      summary.skippedNoIdentity += 1;
      continue;
    }
    if (
      (email && dbEmails.has(email)) ||
      (url && dbUrls.has(url)) ||
      (extId && dbExternalIds.has(extId))
    ) {
      summary.duplicatesInDb += 1;
      continue;
    }
    if (
      (email && seenEmails.has(email)) ||
      (url && seenUrls.has(url)) ||
      (extId && seenExternalIds.has(extId))
    ) {
      summary.duplicatesInBatch += 1;
      continue;
    }
    if (email) seenEmails.add(email);
    if (url) seenUrls.add(url);
    if (extId) seenExternalIds.add(extId);

    let accountId: string | undefined;
    if (p.company) accountId = await resolveAccountId(p.company, accountCache, createdCounter, actor);

    const created = await prisma.contact.create({
      data: {
        name: p.name,
        firstName: p.firstName ?? null,
        lastName: p.lastName ?? null,
        email,
        title: p.title ?? null,
        seniority: p.seniority ?? null,
        linkedinUrl: url,
        location: p.location ?? null,
        accountId,
        companyId: actor.companyId,
        teamId: actor.teamId,
        ownerUserId: actor.id,
        // Locked prospects arrive without an email — not "enriched" until the
        // Enrich action unlocks it. Prospects that already carried an email are.
        enriched: Boolean(email),
        source: 'prospecting',
        externalSource: 'apollo',
        externalId: p.externalId ?? null,
        status: 'new',
      },
      select: { id: true },
    });
    summary.createdIds.push(created.id);
    summary.imported += 1;
  }

  summary.accountsCreated = createdCounter.count;

  await writeAuditLog({
    entityType: 'contact',
    entityId: 'batch',
    action: 'prospecting.import',
    actorType: 'user',
    actorId: actor.id,
    companyId: actor.companyId,
    summary: `Imported ${summary.imported}/${summary.total} prospects into contacts`,
    payload: { ...summary },
    ipAddress: actor.ipAddress,
  });

  return summary;
}
