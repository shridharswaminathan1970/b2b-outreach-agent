// Suppression business logic. Safety-critical: `isSuppressed` is called before
// EVERY send. Suppression is PER-COMPANY — one tenant's opt-outs never affect
// another (unique on companyId+email).
import { Prisma } from '@outreach/db';
import { prisma } from '../../config/database';
import { Errors } from '../../utils/response';
import { writeAuditLog } from '../audit/audit.service';
import type { Actor } from '../../utils/tenancy';

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// True if the email is suppressed within the given company. Email comparison is
// case-insensitive (addresses are stored normalized to lowercase).
export async function isSuppressed(
  email: string | null | undefined,
  companyId: string,
): Promise<boolean> {
  if (!email) return false;
  const hit = await prisma.suppressionList.findUnique({
    where: { companyId_email: { companyId, email: normalizeEmail(email) } },
    select: { id: true },
  });
  return Boolean(hit);
}

// Add an email to a company's suppression list (idempotent) and flag matching
// contacts in that company as suppressed.
// Suppress an email. `actor` is optional: system-initiated suppressions (e.g. a
// hard bounce ingested via a provider webhook or an inbound unsubscribe click)
// have no user, in which case companyId must be supplied and addedBy is null.
export async function addSuppression(
  email: string,
  opts: { reason?: string; source?: string; actor?: Actor; companyId?: string },
) {
  const normalized = normalizeEmail(email);
  const { reason, source, actor } = opts;
  const companyId = opts.companyId ?? actor?.companyId;
  if (!companyId) throw Errors.badRequest('addSuppression requires a companyId or an actor');

  const entry = await prisma.suppressionList.upsert({
    where: { companyId_email: { companyId, email: normalized } },
    update: {}, // already suppressed — keep the original record
    create: {
      companyId,
      email: normalized,
      reason,
      source: source ?? 'manual',
      addedBy: actor?.id ?? null,
    },
  });

  // Reflect suppression on this company's contacts.
  await prisma.contact.updateMany({
    where: { companyId, email: { equals: normalized, mode: 'insensitive' } },
    data: { suppressed: true },
  });

  await writeAuditLog({
    entityType: 'suppression',
    entityId: entry.id,
    action: 'suppression.add',
    actorType: actor?.id ? 'user' : 'system',
    actorId: actor?.id ?? null,
    companyId,
    summary: `Suppressed ${normalized}${reason ? ` (${reason})` : ''}`,
    payload: { email: normalized, reason, source: source ?? 'manual' },
    ipAddress: actor?.ipAddress,
  });

  return entry;
}

export async function listSuppressions(params: {
  page: number;
  limit: number;
  search?: string;
  actor: Actor;
}) {
  const { page, limit, search, actor } = params;
  const where: Prisma.SuppressionListWhereInput = {
    companyId: actor.companyId,
    ...(search ? { email: { contains: search.toLowerCase(), mode: 'insensitive' } } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.suppressionList.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.suppressionList.count({ where }),
  ]);

  return {
    items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

// Remove an email from a company's suppression list (manual re-subscribe).
export async function removeSuppression(email: string, actor: Actor) {
  const normalized = normalizeEmail(email);
  const existing = await prisma.suppressionList.findUnique({
    where: { companyId_email: { companyId: actor.companyId, email: normalized } },
  });
  if (!existing) throw Errors.notFound('Email is not on the suppression list');

  await prisma.suppressionList.delete({ where: { id: existing.id } });
  await prisma.contact.updateMany({
    where: { companyId: actor.companyId, email: { equals: normalized, mode: 'insensitive' } },
    data: { suppressed: false },
  });

  await writeAuditLog({
    entityType: 'suppression',
    entityId: existing.id,
    action: 'suppression.remove',
    actorType: 'user',
    actorId: actor.id,
    companyId: actor.companyId,
    summary: `Removed ${normalized} from suppression list`,
    payload: { email: normalized },
    ipAddress: actor.ipAddress,
  });

  return { removed: true };
}
