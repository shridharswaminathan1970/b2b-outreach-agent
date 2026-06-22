// Worker audit helper. Every job writes a start and end audit entry (CLAUDE.md
// Phase 4). actorType is 'worker'. Mirrors the API's writer contract but lives
// here so the worker doesn't depend on apps/api. Never throws into the job.
import { prisma } from '@outreach/db';
import { logger } from './logger';

export interface WorkerAuditEntry {
  entityType: string;
  entityId: string;
  action: string;
  summary?: string;
  payload?: Record<string, unknown> | null;
}

export async function writeAudit(entry: WorkerAuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        entityType: entry.entityType,
        entityId: entry.entityId,
        action: entry.action,
        actorType: 'worker',
        summary: entry.summary ?? null,
        payloadJson: (entry.payload ?? undefined) as object | undefined,
      },
    });
  } catch (err) {
    logger.error('audit write failed', {
      action: entry.action,
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

// Convenience for the start/end pair: returns an `end` fn to call on completion.
export async function auditJobStart(
  entityType: string,
  entityId: string,
  job: string,
  payload?: Record<string, unknown>,
): Promise<() => Promise<void>> {
  await writeAudit({
    entityType,
    entityId,
    action: `job.${job}.start`,
    summary: `Started ${job} for ${entityType} ${entityId}`,
    payload,
  });
  return async () => {
    await writeAudit({
      entityType,
      entityId,
      action: `job.${job}.end`,
      summary: `Completed ${job} for ${entityType} ${entityId}`,
    });
  };
}
