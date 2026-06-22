// Outbound webhook outbox. `emitWebhook` records an event row (status 'pending')
// that an external system (e.g. IGNITE-APEX CRM) should be notified about. A
// delivery worker (future) POSTs pending rows to their targetUrl with retries.
// Emission NEVER throws into the caller's request path — a webhook is a
// side-effect, not part of the core operation.
import { Prisma } from '@outreach/db';
import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';
import type { Actor } from '../../utils/tenancy';
import type { ListWebhooksInput } from './webhooks.schema';

export type WebhookEvent = 'reply' | 'bounce' | 'conversion';

export interface EmitWebhookInput {
  eventType: WebhookEvent;
  entityType: string;
  entityId: string;
  // Tenant the event belongs to (so external subscriptions are per-company).
  companyId?: string | null;
  // Cross-reference back to the external record that maps to this entity.
  externalSource?: string | null;
  externalId?: string | null;
  // Optional explicit delivery target; otherwise a delivery worker resolves it
  // from a subscription config (future).
  targetUrl?: string | null;
  payload?: Record<string, unknown> | null;
}

export async function emitWebhook(input: EmitWebhookInput): Promise<void> {
  try {
    await prisma.webhookOut.create({
      data: {
        companyId: input.companyId ?? null,
        eventType: input.eventType,
        entityType: input.entityType,
        entityId: input.entityId,
        externalSource: input.externalSource ?? null,
        externalId: input.externalId ?? null,
        targetUrl: input.targetUrl ?? null,
        payloadJson: (input.payload ?? undefined) as object | undefined,
        status: 'pending',
      },
    });
  } catch (err) {
    logger.error('Failed to enqueue outbound webhook', {
      eventType: input.eventType,
      entityType: input.entityType,
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function listWebhooks(params: ListWebhooksInput, actor: Actor) {
  const { page, limit, status, eventType } = params;
  const where: Prisma.WebhookOutWhereInput = {
    companyId: actor.companyId,
    ...(status ? { status } : {}),
    ...(eventType ? { eventType } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.webhookOut.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.webhookOut.count({ where }),
  ]);

  return {
    items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}
