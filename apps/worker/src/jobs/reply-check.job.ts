// Reply-check job (polling): finds replies that arrived without a classification
// (e.g. ingested by an inbox poller) and classifies + routes them. Replies
// ingested through the API are already classified, so this is the safety net.
// Idempotent: only processes replies where classification IS NULL.
//
// Routing:
//   unsubscribe / bounce → suppress the contact immediately
//   interested           → create a "review_reply" task
//   low confidence       → flag needs_human_review (handled by classifier output)
import { Prisma, prisma } from '@outreach/db';
import { classifyReply } from '@outreach/ai';
import { getFramework, stagesFor, stageProbabilityFor } from '@outreach/shared';
import { config } from '../config';
import { logger } from '../logger';
import { writeAudit } from '../audit';

const BATCH = 25;

async function suppressContact(email: string, reason: string, companyId: string): Promise<void> {
  const normalized = email.trim().toLowerCase();
  const entry = await prisma.suppressionList.upsert({
    where: { companyId_email: { companyId, email: normalized } },
    update: {},
    create: { companyId, email: normalized, reason, source: 'reply' },
  });
  await prisma.contact.updateMany({
    where: { companyId, email: { equals: normalized, mode: 'insensitive' } },
    data: { suppressed: true },
  });
  await writeAudit({
    entityType: 'suppression',
    entityId: entry.id,
    action: 'suppression.add',
    summary: `Suppressed ${normalized} (${reason})`,
    payload: { email: normalized, reason },
  });
}

interface ReplyContact {
  id: string;
  name: string;
  companyId: string;
  teamId: string | null;
  ownerUserId: string | null;
}

// Worker-side conversion: auto-create an Opportunity for an "interested" reply
// (config-gated). Idempotent — skips if a non-lost opportunity already exists for
// this contact + campaign. Also notifies external systems via the webhook outbox.
async function createOpportunityFromReply(
  replyId: string,
  contact: ReplyContact,
  campaignId: string | null,
): Promise<void> {
  const existing = await prisma.opportunity.findFirst({
    where: {
      contactId: contact.id,
      campaignId: campaignId ?? undefined,
      stage: { not: 'closed_lost' },
    },
    select: { id: true },
  });
  if (existing) return;

  // Land the new opportunity in the first stage of the company's framework
  // (general → "new", ignite_apex → "ignite").
  const company = await prisma.company.findUnique({
    where: { id: contact.companyId },
    select: { salesFramework: true },
  });
  const framework = getFramework(company?.salesFramework).id;
  const firstStage = stagesFor(framework)[0];

  const opp = await prisma.opportunity.create({
    data: {
      companyId: contact.companyId,
      teamId: contact.teamId,
      ownerUserId: contact.ownerUserId,
      contactId: contact.id,
      campaignId: campaignId ?? null,
      name: `${contact.name} — opportunity`,
      stage: firstStage,
      probability: stageProbabilityFor(framework, firstStage),
      source: 'reply_conversion',
    },
  });

  // Notify external systems of the conversion (worker writes the outbox directly).
  await prisma.webhookOut.create({
    data: {
      companyId: contact.companyId,
      eventType: 'conversion',
      entityType: 'reply',
      entityId: replyId,
      status: 'pending',
      payloadJson: { contactId: contact.id, opportunityId: opp.id, source: 'worker' },
    },
  });

  await writeAudit({
    entityType: 'opportunity',
    entityId: opp.id,
    action: 'opportunity.create',
    summary: `Auto-created opportunity from interested reply ${replyId}`,
    payload: { contactId: contact.id, campaignId, replyId },
  });
}

export async function replyCheckJob(): Promise<void> {
  const pending = await prisma.reply.findMany({
    where: { classification: null },
    take: BATCH,
    include: {
      contact: {
        select: {
          id: true,
          name: true,
          email: true,
          companyId: true,
          teamId: true,
          ownerUserId: true,
        },
      },
      message: { select: { campaignId: true, campaign: { select: { companyId: true } } } },
    },
  });
  if (pending.length === 0) return;

  logger.info('reply-check: processing batch', { count: pending.length });

  for (const reply of pending) {
    try {
      const ai = await classifyReply(reply.rawBody ?? '', reply.message.campaign.companyId);
      if (!ai.ok) {
        // Could not classify — flag for review and move on.
        await prisma.reply.update({
          where: { id: reply.id },
          data: { classification: 'unknown', needsHumanReview: true },
        });
        continue;
      }

      await prisma.reply.update({
        where: { id: reply.id },
        data: {
          classification: ai.classification,
          confidence: new Prisma.Decimal(ai.confidence),
          summary: ai.summary,
          needsHumanReview: ai.needsHumanReview,
          promptVersionId: ai.meta.promptVersionId,
          aiTokensUsed: ai.meta.totalTokens > 0 ? ai.meta.totalTokens : null,
        },
      });

      // Route by classification.
      if (
        (ai.classification === 'unsubscribe' || ai.classification === 'bounce') &&
        reply.contact.email
      ) {
        await suppressContact(
          reply.contact.email,
          ai.classification === 'unsubscribe' ? 'unsubscribe' : 'hard_bounce',
          reply.message.campaign.companyId,
        );
      } else if (ai.classification === 'interested') {
        await prisma.task.create({
          data: {
            contactId: reply.contactId,
            campaignId: reply.message.campaignId,
            replyId: reply.id,
            taskType: 'review_reply',
            priority: 'high',
            description: 'Interested reply — follow up',
          },
        });
        // Worker-side conversion: auto-create an opportunity (config-gated).
        if (config.autoCreateOpportunity) {
          await createOpportunityFromReply(reply.id, reply.contact, reply.message.campaignId);
        }
      }

      await writeAudit({
        entityType: 'reply',
        entityId: reply.id,
        action: 'reply.classify',
        summary: `Worker classified reply as ${ai.classification}`,
        payload: { classification: ai.classification, confidence: ai.confidence },
      });
    } catch (err) {
      // One bad reply must not abort the batch.
      logger.error('reply-check: failed on reply', {
        replyId: reply.id,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
