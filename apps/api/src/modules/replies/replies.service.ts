// Replies business logic: ingest an inbound reply (classified on arrival),
// list/get, re-classify, and route ("handle") a reply into a task, meeting,
// suppression, follow-up, or ignore.
//
// SAFETY-CRITICAL: a reply classified as `unsubscribe` is suppressed within the
// SAME request (never async) per CLAUDE.md. A classified `bounce` is treated as
// a hard bounce and also suppressed.
import { Prisma } from '@outreach/db';
import { prisma } from '../../config/database';
import { Errors } from '../../utils/response';
import { writeAuditLog } from '../audit/audit.service';
import { addSuppression } from '../suppression/suppression.service';
import { createOpportunity } from '../opportunities/opportunities.service';
import { type Actor, scopeWhere, assertCanRead, assertCanWrite } from '../../utils/tenancy';
import { emitWebhook } from '../webhooks/webhooks.service';
import { classifyReply as aiClassifyReply, type ReplyClassification } from '@outreach/ai';
import type {
  ListRepliesInput,
  IngestReplyInput,
  ClassifyReplyInput,
  HandleReplyInput,
} from './replies.schema';

export type { Actor };

// where-fragment restricting replies to those whose campaign (via the
// originating message) the actor owns.
function replyScope(actor: Actor): Prisma.ReplyWhereInput {
  return { message: { campaign: scopeWhere(actor, { team: true }) } };
}

// Below this confidence a reply is flagged for human review (CLAUDE.md: AI
// classification with confidence < 0.7 sets needs_human_review = true). The
// deterministic stand-in classifier honours the same threshold so behaviour is
// identical once the Claude classifier is wired in (Phase 3).
const CONFIDENCE_THRESHOLD = 0.7;

// Classifications that must remove the contact from outreach immediately.
function isSuppressing(classification: ReplyClassification): boolean {
  return classification === 'unsubscribe' || classification === 'bounce';
}

function suppressionReason(classification: ReplyClassification): string {
  return classification === 'unsubscribe' ? 'unsubscribe' : 'hard_bounce';
}

// Ingest an inbound reply against the originating outbound message. The body is
// classified on arrival; opt-outs/bounces are suppressed synchronously.
export async function ingestReply(input: IngestReplyInput, actor: Actor) {
  const message = await prisma.message.findUnique({
    where: { id: input.messageId },
    select: {
      id: true,
      contactId: true,
      contact: {
        select: { id: true, email: true, externalSource: true, externalId: true },
      },
      campaign: { select: { companyId: true, teamId: true } },
    },
  });
  if (!message) throw Errors.badRequest('messageId does not reference a message');
  // An sdr may only ingest replies for messages in their own campaigns.
  assertCanRead(actor, message.campaign, { team: true });

  // Classify via the AI layer (mock mode falls back to deterministic keywords).
  // Pass the tenant so a company-specific classification prompt can apply.
  const ai = await aiClassifyReply(input.rawBody ?? '', message.campaign.companyId);
  const result = ai.ok
    ? ai
    : {
        classification: 'unknown' as ReplyClassification,
        confidence: 0,
        summary: 'Classification failed; flagged for review',
        needsHumanReview: true,
        meta: { promptVersionId: null, totalTokens: 0 },
      };

  const reply = await prisma.reply.create({
    data: {
      messageId: message.id,
      contactId: message.contactId,
      rawBody: input.rawBody,
      classification: result.classification,
      confidence: new Prisma.Decimal(result.confidence),
      summary: result.summary,
      needsHumanReview: result.needsHumanReview,
      promptVersionId: result.meta.promptVersionId,
      aiTokensUsed: result.meta.totalTokens > 0 ? result.meta.totalTokens : null,
      receivedAt: input.receivedAt ?? new Date(),
    },
  });

  // ── Immediate suppression for opt-outs / bounces — same request, not async. ──
  let suppressed = false;
  if (isSuppressing(result.classification) && message.contact.email) {
    await addSuppression(message.contact.email, {
      reason: suppressionReason(result.classification),
      source: 'reply',
      actor,
    });
    suppressed = true;
  }

  await writeAuditLog({
    entityType: 'reply',
    entityId: reply.id,
    action: 'reply.ingest',
    actorType: 'system',
    actorId: actor.id,
    summary: `Reply classified as ${result.classification} (confidence ${result.confidence})${
      suppressed ? '; contact suppressed' : ''
    }`,
    payload: {
      classification: result.classification,
      confidence: result.confidence,
      needsHumanReview: result.needsHumanReview,
      suppressed,
    },
    ipAddress: actor.ipAddress,
  });

  // Notify external systems (e.g. IGNITE-APEX CRM) of the inbound reply. A
  // suppressing reply (unsubscribe/bounce) additionally emits a 'bounce' event.
  await emitWebhook({
    eventType: result.classification === 'bounce' ? 'bounce' : 'reply',
    entityType: 'reply',
    entityId: reply.id,
    companyId: message.campaign.companyId,
    externalSource: message.contact.externalSource,
    externalId: message.contact.externalId,
    payload: {
      classification: result.classification,
      confidence: result.confidence,
      contactId: message.contactId,
      suppressed,
    },
  });

  return reply;
}

export async function listReplies(params: ListRepliesInput, actor: Actor) {
  const { page, limit, classification, needsHumanReview, handled, contactId, campaignId } =
    params;

  const where: Prisma.ReplyWhereInput = {
    ...(classification ? { classification } : {}),
    ...(needsHumanReview !== undefined ? { needsHumanReview } : {}),
    ...(handled !== undefined ? { handled } : {}),
    ...(contactId ? { contactId } : {}),
    // campaign is reached through the originating message.
    ...(campaignId ? { message: { campaignId } } : {}),
    ...replyScope(actor),
  };

  const [items, total] = await Promise.all([
    prisma.reply.findMany({
      where,
      orderBy: { receivedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        contact: { select: { id: true, name: true, email: true } },
        message: { select: { id: true, campaignId: true, subject: true } },
      },
    }),
    prisma.reply.count({ where }),
  ]);

  return {
    items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function getReplyById(id: string, actor: Actor) {
  const reply = await prisma.reply.findUnique({
    where: { id },
    include: {
      contact: { select: { id: true, name: true, email: true } },
      message: {
        select: {
          id: true,
          campaignId: true,
          subject: true,
          campaign: { select: { companyId: true, teamId: true } },
        },
      },
      tasks: { orderBy: { createdAt: 'desc' } },
    },
  });
  if (!reply) throw Errors.notFound('Reply not found');
  assertCanRead(actor, reply.message.campaign, { team: true });
  return reply;
}

// Re-run classification (after the AI classifier is wired up) or apply a
// human-supplied classification override.
export async function reclassifyReply(id: string, input: ClassifyReplyInput, actor: Actor) {
  const reply = await prisma.reply.findUnique({
    where: { id },
    select: {
      id: true,
      rawBody: true,
      contactId: true,
      contact: { select: { email: true } },
      message: { select: { campaign: { select: { companyId: true, teamId: true } } } },
    },
  });
  if (!reply) throw Errors.notFound('Reply not found');
  assertCanWrite(actor, reply.message.campaign, { team: true });

  let classification: ReplyClassification;
  let confidence: number;
  let summary: string | undefined;

  if (input.classification) {
    // Human override is authoritative — full confidence, never needs review.
    classification = input.classification;
    confidence = 1;
  } else {
    const ai = await aiClassifyReply(reply.rawBody ?? '', reply.message.campaign.companyId);
    if (ai.ok) {
      classification = ai.classification;
      confidence = ai.confidence;
      summary = ai.summary;
    } else {
      classification = 'unknown';
      confidence = 0.4;
    }
  }

  const needsHumanReview = confidence < CONFIDENCE_THRESHOLD;

  const updated = await prisma.reply.update({
    where: { id },
    data: {
      classification,
      confidence: new Prisma.Decimal(confidence),
      ...(summary !== undefined ? { summary } : {}),
      needsHumanReview,
    },
  });

  // A re-classification that lands on unsubscribe/bounce must still suppress.
  let suppressed = false;
  if (isSuppressing(classification) && reply.contact.email) {
    await addSuppression(reply.contact.email, {
      reason: suppressionReason(classification),
      source: 'reply',
      actor,
    });
    suppressed = true;
  }

  await writeAuditLog({
    entityType: 'reply',
    entityId: id,
    action: 'reply.classify',
    actorType: 'user',
    actorId: actor.id,
    summary: `Reclassified as ${classification}${input.classification ? ' (manual)' : ''}${
      suppressed ? '; contact suppressed' : ''
    }`,
    payload: { classification, confidence, manual: Boolean(input.classification), suppressed },
    ipAddress: actor.ipAddress,
  });

  return updated;
}

// Route a reply to a concrete next action and mark it handled. Idempotency:
// re-handling an already-handled reply is rejected to avoid duplicate tasks.
export async function handleReply(id: string, input: HandleReplyInput, actor: Actor) {
  const reply = await prisma.reply.findUnique({
    where: { id },
    include: {
      contact: {
        select: { id: true, name: true, email: true, externalSource: true, externalId: true },
      },
      message: {
        select: { campaignId: true, campaign: { select: { companyId: true, teamId: true } } },
      },
    },
  });
  if (!reply) throw Errors.notFound('Reply not found');
  assertCanWrite(actor, reply.message.campaign, { team: true });
  if (reply.handled) throw Errors.conflict('Reply has already been handled');

  let taskId: string | undefined;

  switch (input.action) {
    case 'created_task': {
      const task = await createTask({
        contactId: reply.contactId,
        ownerUserId: input.ownerUserId,
        campaignId: reply.message.campaignId,
        replyId: reply.id,
        taskType: input.taskType!, // schema guarantees presence for this action
        dueAt: input.dueAt,
        notes: input.notes,
      });
      taskId = task.id;
      break;
    }
    case 'booked_meeting': {
      const task = await createTask({
        contactId: reply.contactId,
        ownerUserId: input.ownerUserId,
        campaignId: reply.message.campaignId,
        replyId: reply.id,
        taskType: 'book_meeting',
        dueAt: input.dueAt,
        notes: input.notes,
        priority: 'high',
      });
      taskId = task.id;
      break;
    }
    case 'suppressed': {
      if (!reply.contact.email) {
        throw Errors.badRequest('Contact has no email address to suppress');
      }
      await addSuppression(reply.contact.email, {
        reason: 'manual_reply_handling',
        source: 'reply',
        actor,
      });
      break;
    }
    case 'follow_up':
    case 'ignored':
      // No side-effect entity; the audit log + handled flag capture the decision.
      break;
    default:
      throw Errors.badRequest('Unsupported handle action');
  }

  const updated = await prisma.reply.update({
    where: { id },
    data: {
      handled: true,
      handledBy: actor.id,
      handledAt: new Date(),
      handleAction: input.action,
    },
  });

  // A booked meeting is a conversion.
  const isConversion =
    input.action === 'booked_meeting' ||
    (input.action === 'created_task' && input.taskType === 'book_meeting');

  // Auto-create an Opportunity from the conversion (default ON). Callers can
  // skip it with createOpportunity:false (and create one manually later), or
  // pass `opportunity` to customise the deal that gets created.
  let opportunity: Awaited<ReturnType<typeof createOpportunity>> | null = null;
  if (isConversion && input.createOpportunity !== false) {
    const o = input.opportunity ?? {};
    opportunity = await createOpportunity(
      {
        name: o.name ?? `${reply.contact.name} — opportunity`,
        // Stage left to the framework default (general → "new", ignite_apex →
        // "ignite") unless the caller explicitly shapes the deal. Honouring the
        // ignite_apex gates means a conversion can't jump straight to a later
        // stage without the qualification work behind it.
        stage: o.stage,
        amount: o.amount,
        currency: o.currency ?? 'USD',
        probability: o.probability,
        expectedCloseDate: o.expectedCloseDate,
        ownerUserId: o.ownerUserId ?? actor.id,
        contactId: reply.contactId,
        campaignId: reply.message.campaignId ?? undefined,
        source: 'reply_conversion',
      },
      actor,
    );
  }

  await writeAuditLog({
    entityType: 'reply',
    entityId: id,
    action: `reply.handle.${input.action}`,
    actorType: 'user',
    actorId: actor.id,
    summary: `Reply handled: ${input.action}${taskId ? ` (task ${taskId})` : ''}${
      opportunity ? ` (opportunity ${opportunity.id})` : ''
    }`,
    payload: { action: input.action, taskId, notes: input.notes, opportunityId: opportunity?.id },
    ipAddress: actor.ipAddress,
  });

  if (isConversion) {
    await emitWebhook({
      eventType: 'conversion',
      entityType: 'reply',
      entityId: id,
      companyId: reply.message.campaign.companyId,
      externalSource: reply.contact.externalSource,
      externalId: reply.contact.externalId,
      payload: {
        action: input.action,
        taskId,
        contactId: reply.contactId,
        opportunityId: opportunity?.id ?? null,
      },
    });
  }

  return { reply: updated, opportunity };
}

// Internal helper: create a task row tied to a reply.
async function createTask(args: {
  contactId: string;
  ownerUserId?: string;
  campaignId?: string | null;
  replyId: string;
  taskType: string;
  dueAt?: Date;
  notes?: string;
  priority?: string;
}) {
  return prisma.task.create({
    data: {
      contactId: args.contactId,
      ownerUserId: args.ownerUserId ?? null,
      campaignId: args.campaignId ?? null,
      replyId: args.replyId,
      taskType: args.taskType,
      dueAt: args.dueAt ?? null,
      notes: args.notes ?? null,
      ...(args.priority ? { priority: args.priority } : {}),
    },
  });
}
