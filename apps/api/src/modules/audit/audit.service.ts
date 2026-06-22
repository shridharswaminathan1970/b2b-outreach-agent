// Audit log service. The writer (`writeAuditLog`) is the single entry point every
// module uses to record a state change. Audit logs are APPEND-ONLY — this module
// never exposes update or delete. (Query/export endpoints are added in the audit
// module task; the writer lives here so other modules can depend on it now.)
import { Prisma } from '@outreach/db';
import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';
import type { Actor } from '../../utils/tenancy';
import type { ListAuditLogsInput, ExportAuditLogsInput } from './audit.schema';

export type ActorType = 'user' | 'system' | 'worker';

export interface AuditEntry {
  entityType: string;
  entityId: string;
  action: string;
  actorType?: ActorType;
  actorId?: string | null;
  // Tenant scope for company-isolated audit queries (optional; system/auth
  // events may have no company context).
  companyId?: string | null;
  summary?: string;
  payload?: Record<string, unknown> | null;
  ipAddress?: string | null;
}

// Writes one audit row. Never throws into the caller's request path: a failed
// audit write is logged but must not break the underlying operation.
export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  try {
    // Tag the row with the actor's company when not explicitly provided, so
    // existing call sites get tenant-scoped audit for free.
    let companyId = entry.companyId ?? null;
    if (!companyId && entry.actorId) {
      const u = await prisma.user.findUnique({
        where: { id: entry.actorId },
        select: { companyId: true },
      });
      companyId = u?.companyId ?? null;
    }

    await prisma.auditLog.create({
      data: {
        entityType: entry.entityType,
        entityId: entry.entityId,
        action: entry.action,
        actorType: entry.actorType ?? 'system',
        actorId: entry.actorId ?? null,
        companyId,
        summary: entry.summary ?? null,
        payloadJson: (entry.payload ?? undefined) as object | undefined,
        ipAddress: entry.ipAddress ?? null,
      },
    });
  } catch (err) {
    logger.error('Failed to write audit log', {
      entityType: entry.entityType,
      action: entry.action,
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

// ── Query / export (read-only; audit logs are append-only) ──────────────────

// Build the Prisma WHERE clause shared by query and export from the filters.
function buildWhere(f: {
  entityType?: string;
  entityId?: string;
  action?: string;
  actorType?: string;
  actorId?: string;
  from?: Date;
  to?: Date;
}): Prisma.AuditLogWhereInput {
  const createdAt =
    f.from || f.to
      ? { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lt: f.to } : {}) }
      : undefined;

  return {
    ...(f.entityType ? { entityType: f.entityType } : {}),
    ...(f.entityId ? { entityId: f.entityId } : {}),
    ...(f.action ? { action: f.action } : {}),
    ...(f.actorType ? { actorType: f.actorType } : {}),
    ...(f.actorId ? { actorId: f.actorId } : {}),
    ...(createdAt ? { createdAt } : {}),
  };
}

// Tenant scope for audit reads: every role only sees their own company's trail.
function companyScope(actor: Actor): Prisma.AuditLogWhereInput {
  return { companyId: actor.companyId };
}

export async function listAuditLogs(params: ListAuditLogsInput, actor: Actor) {
  const { page, limit, ...filters } = params;
  const where = { ...buildWhere(filters), ...companyScope(actor) };

  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return {
    items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

// RFC 4180 cell escaping: quote if the value contains a comma, quote, or newline;
// double any embedded quotes.
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let s: string;
  if (value instanceof Date) {
    s = value.toISOString();
  } else if (typeof value === 'object') {
    s = JSON.stringify(value);
  } else {
    s = String(value);
  }
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const CSV_COLUMNS = [
  'id',
  'entityType',
  'entityId',
  'action',
  'actorType',
  'actorId',
  'summary',
  'payloadJson',
  'ipAddress',
  'createdAt',
] as const;

// Export filtered audit logs as a CSV string (oldest-first for a readable trail).
export async function exportAuditLogsCsv(
  params: ExportAuditLogsInput,
  actor: Actor,
): Promise<string> {
  const { limit, ...filters } = params;
  const rows = await prisma.auditLog.findMany({
    where: { ...buildWhere(filters), ...companyScope(actor) },
    orderBy: { createdAt: 'asc' },
    take: limit,
  });

  const lines = [CSV_COLUMNS.join(',')];
  for (const row of rows) {
    lines.push(CSV_COLUMNS.map((col) => csvCell((row as Record<string, unknown>)[col])).join(','));
  }
  return lines.join('\n');
}
