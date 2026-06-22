// Contacts business logic: CRUD, status management, and bulk CSV/JSON import
// with email-based deduplication. Every mutation writes an audit log entry.
import { Prisma } from '@outreach/db';
import { prisma } from '../../config/database';
import { Errors } from '../../utils/response';
import { writeAuditLog } from '../audit/audit.service';
import { getEnrichmentAdapter } from '@outreach/integrations';
import { deriveContactName } from './contacts.import';
import {
  type Actor,
  scopeWhere,
  assertCanRead,
  assertCanWrite,
  canWrite,
} from '../../utils/tenancy';
import type {
  ListContactsInput,
  CreateContactInput,
  UpdateContactInput,
  ImportContactRow,
} from './contacts.schema';

export type { Actor };

export async function listContacts(params: ListContactsInput, actor: Actor) {
  const { page, limit, search, status, accountId, ownerUserId, enriched, suppressed } =
    params;

  const where: Prisma.ContactWhereInput = {
    ...(status ? { status } : {}),
    ...(accountId ? { accountId } : {}),
    ...(ownerUserId ? { ownerUserId } : {}),
    ...(enriched !== undefined ? { enriched } : {}),
    ...(suppressed !== undefined ? { suppressed } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
            { title: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {}),
    // Mandatory tenant + team scoping: always company-isolated; team roles
    // (sales_manager / sdr) are further restricted to their own team.
    ...scopeWhere(actor, { team: true }),
  };

  const [items, total] = await Promise.all([
    prisma.contact.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: { account: { select: { id: true, name: true, domain: true } } },
    }),
    prisma.contact.count({ where }),
  ]);

  return {
    items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function getContactById(id: string, actor: Actor) {
  const contact = await prisma.contact.findUnique({
    where: { id },
    include: { account: { select: { id: true, name: true, domain: true } } },
  });
  if (!contact) throw Errors.notFound('Contact not found');
  // Company + team isolation (404, not 403, to avoid leaking existence).
  assertCanRead(actor, contact, { team: true });
  return contact;
}

export async function createContact(input: CreateContactInput, actor: Actor) {
  if (!canWrite(actor.role)) throw Errors.forbidden('Your role may not create contacts');
  const { metadata, name, ...rest } = input;

  // Reject a duplicate email up front (no DB-level unique on email).
  if (input.email) {
    const existing = await prisma.contact.findFirst({
      where: { email: input.email },
      select: { id: true },
    });
    if (existing) throw Errors.conflict('A contact with that email already exists');
  }

  const contact = await prisma.contact.create({
    data: {
      ...rest,
      name: deriveContactName({ name, ...rest }),
      // Stamp tenancy from the creator. teamId from the creator's team (null for
      // company-wide roles). ownerUserId defaults to the creator.
      companyId: actor.companyId,
      teamId: actor.teamId,
      ownerUserId: rest.ownerUserId ?? actor.id,
      ...(metadata !== undefined
        ? { metadataJson: metadata as Prisma.InputJsonValue }
        : {}),
    },
  });

  await writeAuditLog({
    entityType: 'contact',
    entityId: contact.id,
    action: 'contact.create',
    actorType: 'user',
    actorId: actor.id,
    summary: `Created contact ${contact.name}`,
    ipAddress: actor.ipAddress,
  });

  return contact;
}

export async function updateContact(
  id: string,
  input: UpdateContactInput,
  actor: Actor,
) {
  const current = await getContactById(id, actor);
  assertCanWrite(actor, current, { team: true });

  // If email is being changed to a value used by another contact, reject.
  if (input.email) {
    const clash = await prisma.contact.findFirst({
      where: { email: input.email, NOT: { id } },
      select: { id: true },
    });
    if (clash) throw Errors.conflict('Another contact already uses that email');
  }

  const { metadata, ...rest } = input;
  const data: Prisma.ContactUpdateInput = { ...rest } as Prisma.ContactUpdateInput;
  if (metadata !== undefined) {
    data.metadataJson = metadata as Prisma.InputJsonValue;
  }

  const contact = await prisma.contact.update({ where: { id }, data });

  await writeAuditLog({
    entityType: 'contact',
    entityId: contact.id,
    action: 'contact.update',
    actorType: 'user',
    actorId: actor.id,
    summary: `Updated contact ${contact.name}: ${Object.keys(input).join(', ')}`,
    payload: { changedFields: Object.keys(input) },
    ipAddress: actor.ipAddress,
  });

  return contact;
}

export async function updateContactStatus(id: string, status: string, actor: Actor) {
  const current = await getContactById(id, actor);
  assertCanWrite(actor, current, { team: true });

  const contact = await prisma.contact.update({
    where: { id },
    data: { status },
  });

  await writeAuditLog({
    entityType: 'contact',
    entityId: id,
    action: 'contact.status_change',
    actorType: 'user',
    actorId: actor.id,
    summary: `Status ${current.status} -> ${status}`,
    payload: { from: current.status, to: status },
    ipAddress: actor.ipAddress,
  });

  return contact;
}

export async function deleteContact(id: string, actor: Actor) {
  const contact = await getContactById(id, actor);
  assertCanWrite(actor, contact, { team: true });

  await prisma.contact.delete({ where: { id } });

  await writeAuditLog({
    entityType: 'contact',
    entityId: id,
    action: 'contact.delete',
    actorType: 'user',
    actorId: actor.id,
    summary: `Deleted contact ${contact.name}`,
    ipAddress: actor.ipAddress,
  });

  return { deleted: true };
}

export interface ImportSummary {
  total: number;
  imported: number;
  duplicatesInFile: number;
  duplicatesInDb: number;
  accountsCreated: number;
}

// Resolve a company name to an account id, creating the account on first sight.
// Results are cached per-import in `cache` to avoid duplicate lookups/creates.
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
    where: { name: { equals: companyName.trim(), mode: 'insensitive' } },
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

  await writeAuditLog({
    entityType: 'account',
    entityId: account.id,
    action: 'account.create',
    actorType: 'user',
    actorId: actor.id,
    summary: `Auto-created account ${companyName.trim()} during contact import`,
    ipAddress: actor.ipAddress,
  });

  return account.id;
}

export async function importContacts(
  rows: ImportContactRow[],
  meta: { accountId?: string; sourceFile?: string },
  actor: Actor,
): Promise<ImportSummary> {
  if (!canWrite(actor.role)) throw Errors.forbidden('Your role may not import contacts');
  const summary: ImportSummary = {
    total: rows.length,
    imported: 0,
    duplicatesInFile: 0,
    duplicatesInDb: 0,
    accountsCreated: 0,
  };

  // Pre-load existing emails so we dedup against the DB without a query per row.
  const incomingEmails = rows
    .map((r) => r.email?.toLowerCase())
    .filter((e): e is string => Boolean(e));
  const existing = await prisma.contact.findMany({
    where: { email: { in: incomingEmails } },
    select: { email: true },
  });
  const dbEmails = new Set(existing.map((c) => c.email?.toLowerCase()));
  const seenInFile = new Set<string>();

  const accountCache = new Map<string, string>();
  const createdCounter = { count: 0 };

  for (const row of rows) {
    const email = row.email?.toLowerCase();

    if (email) {
      if (dbEmails.has(email)) {
        summary.duplicatesInDb += 1;
        continue;
      }
      if (seenInFile.has(email)) {
        summary.duplicatesInFile += 1;
        continue;
      }
      seenInFile.add(email);
    }

    let accountId = meta.accountId;
    if (!accountId && row.company) {
      accountId = await resolveAccountId(row.company, accountCache, createdCounter, actor);
    }

    await prisma.contact.create({
      data: {
        name: deriveContactName(row),
        firstName: row.firstName,
        lastName: row.lastName,
        email,
        phone: row.phone,
        title: row.title,
        linkedinUrl: row.linkedinUrl,
        accountId,
        companyId: actor.companyId,
        teamId: actor.teamId,
        ownerUserId: actor.id,
        source: 'import',
        sourceFile: meta.sourceFile,
        status: 'new',
      },
    });
    summary.imported += 1;
  }

  summary.accountsCreated = createdCounter.count;

  await writeAuditLog({
    entityType: 'contact',
    entityId: 'batch',
    action: 'contact.import',
    actorType: 'user',
    actorId: actor.id,
    summary: `Imported ${summary.imported}/${summary.total} contacts from ${meta.sourceFile ?? 'upload'}`,
    payload: { ...summary, sourceFile: meta.sourceFile },
    ipAddress: actor.ipAddress,
  });

  return summary;
}

// ── Enrichment (synchronous, for the one-click "Enrich" UI) ──────────────────
// Runs the same Apollo people-match the worker enrichment job uses, but inline so
// the caller gets immediate success/error + the unlocked email. The worker job
// remains the async/batch path; this is the interactive one.

type LoadedContact = Awaited<ReturnType<typeof getContactById>>;

async function enrichOne(contact: LoadedContact, actor: Actor) {
  const adapter = getEnrichmentAdapter();
  const result = await adapter.enrich({
    email: contact.email,
    firstName: contact.firstName,
    lastName: contact.lastName,
    company: contact.account?.name,
    domain: contact.account?.domain,
    linkedinUrl: contact.linkedinUrl,
    externalId: contact.externalId,
  });

  const emailUnlocked = !contact.email && Boolean(result.email);
  const newEmail = contact.email ?? result.email ?? null;
  const validation = newEmail ? await adapter.validate(newEmail) : null;

  const updated = await prisma.contact.update({
    where: { id: contact.id },
    data: {
      email: newEmail ?? undefined,
      title: contact.title ?? result.title ?? undefined,
      seniority: contact.seniority ?? result.seniority ?? undefined,
      department: contact.department ?? result.department ?? undefined,
      phone: contact.phone ?? result.phone ?? undefined,
      linkedinUrl: contact.linkedinUrl ?? result.linkedinUrl ?? undefined,
      location: contact.location ?? result.location ?? undefined,
      enriched: result.found,
      emailVerified: validation?.deliverable ?? contact.emailVerified,
      validated: validation ? validation.valid : contact.validated,
    },
    include: { account: { select: { id: true, name: true, domain: true } } },
  });

  // Backfill account firmographics (drives ICP scoring) when newly known.
  if (contact.account && (result.companySize || result.industry)) {
    await prisma.account.update({
      where: { id: contact.account.id },
      data: {
        sizeBand: result.companySize ?? undefined,
        industry: result.industry ?? undefined,
        domain: contact.account.domain ?? result.companyDomain ?? undefined,
      },
    });
  }

  await writeAuditLog({
    entityType: 'contact',
    entityId: contact.id,
    action: 'contact.enriched',
    actorType: 'user',
    actorId: actor.id,
    companyId: actor.companyId,
    summary: `Enriched ${contact.name} via ${result.provider} (found=${result.found}, emailUnlocked=${emailUnlocked})`,
    payload: { provider: result.provider, found: result.found, emailUnlocked },
    ipAddress: actor.ipAddress,
  });

  return { contact: updated, found: result.found, emailUnlocked, provider: result.provider };
}

export async function enrichContact(id: string, actor: Actor) {
  if (!canWrite(actor.role)) throw Errors.forbidden('Your role may not enrich contacts');
  const contact = await getContactById(id, actor); // tenant/team scoped
  return enrichOne(contact, actor);
}

export interface EnrichBatchSummary {
  requested: number;
  enriched: number;
  emailsUnlocked: number;
  notFound: number;
  failed: number;
}

export async function enrichContacts(ids: string[], actor: Actor): Promise<EnrichBatchSummary> {
  if (!canWrite(actor.role)) throw Errors.forbidden('Your role may not enrich contacts');
  const summary: EnrichBatchSummary = {
    requested: ids.length,
    enriched: 0,
    emailsUnlocked: 0,
    notFound: 0,
    failed: 0,
  };
  // Sequential to stay within provider rate limits.
  for (const id of ids) {
    try {
      const contact = await getContactById(id, actor);
      const res = await enrichOne(contact, actor);
      summary.enriched += 1;
      if (res.emailUnlocked) summary.emailsUnlocked += 1;
      if (!res.found) summary.notFound += 1;
    } catch {
      summary.failed += 1;
    }
  }
  return summary;
}
