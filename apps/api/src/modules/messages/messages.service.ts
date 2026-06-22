// Messages business logic: sending (with a mandatory pre-send suppression
// check), status lookup, and deliverability/tracking event ingestion. A hard
// bounce auto-adds the recipient to the suppression list.
import { Prisma } from '@outreach/db';
import { prisma } from '../../config/database';
import { config } from '../../config';
import { Errors } from '../../utils/response';
import { writeAuditLog } from '../audit/audit.service';
import { isSuppressed, addSuppression } from '../suppression/suppression.service';
import { emitWebhook } from '../webhooks/webhooks.service';
import { sendEmail } from './messages.sender';
import {
  type Actor,
  scopeWhere,
  assertCanRead,
  assertCanWrite,
} from '../../utils/tenancy';
import type {
  ListMessagesInput,
  SendMessageInput,
  RecordEventInput,
} from './messages.schema';

export type { Actor };

// where-fragment restricting messages to those whose campaign is in the actor's
// tenant + team scope.
function messageScope(actor: Actor): Prisma.MessageWhereInput {
  return { campaign: scopeWhere(actor, { team: true }) };
}

// Verify the actor may SEND within a campaign (writer, in scope). Throws otherwise.
async function assertCampaignSendable(campaignId: string, actor: Actor): Promise<void> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { companyId: true, teamId: true },
  });
  if (!campaign) throw Errors.badRequest('campaignId does not reference a campaign');
  assertCanWrite(actor, campaign, { team: true });
}

interface ResolvedSend {
  contactId: string;
  campaignId: string;
  sequenceStepId?: string;
  draftId?: string;
  toAddress: string;
  subject: string;
  body: string;
}

// Resolve a send request into concrete fields, validating referenced entities.
async function resolveSend(input: SendMessageInput): Promise<ResolvedSend> {
  if (input.draftId) {
    const draft = await prisma.draft.findUnique({
      where: { id: input.draftId },
      include: { contact: { select: { id: true, email: true } } },
    });
    if (!draft) throw Errors.badRequest('draftId does not reference a draft');

    // Per CLAUDE.md drafts must be approved before they can be sent.
    if (draft.status !== 'approved') {
      throw Errors.conflict(`Draft must be approved before sending (is ${draft.status})`);
    }
    if (!draft.contact.email) {
      throw Errors.badRequest('Contact has no email address');
    }

    return {
      contactId: draft.contactId,
      campaignId: draft.campaignId,
      sequenceStepId: draft.sequenceStepId ?? undefined,
      draftId: draft.id,
      toAddress: draft.contact.email,
      subject: draft.subject ?? '',
      body: draft.body ?? '',
    };
  }

  // Ad-hoc path (contactId + campaignId + body validated by the schema).
  const contact = await prisma.contact.findUnique({
    where: { id: input.contactId! },
    select: { id: true, email: true },
  });
  if (!contact) throw Errors.badRequest('contactId does not reference a contact');
  if (!contact.email) throw Errors.badRequest('Contact has no email address');

  const campaign = await prisma.campaign.findUnique({
    where: { id: input.campaignId! },
    select: { id: true },
  });
  if (!campaign) throw Errors.badRequest('campaignId does not reference a campaign');

  return {
    contactId: contact.id,
    campaignId: input.campaignId!,
    sequenceStepId: input.sequenceStepId,
    toAddress: contact.email,
    subject: input.subject ?? '',
    body: input.body!,
  };
}

// Domains that are clearly placeholders / never deliverable — a live send from
// these is almost certainly a misconfiguration, so we refuse it.
const PLACEHOLDER_FROM_DOMAINS = new Set([
  'example.com',
  'example.org',
  'example.net',
  'test.com',
  'localhost',
]);

// Guard the sender on LIVE sends (safe-by-default): refuse placeholder domains,
// and — when EMAIL_VERIFIED_DOMAINS is configured — refuse any from-domain not on
// the allowlist. Resend's shared test sender (resend.dev) is always allowed.
// Mock sends are unrestricted.
function assertSendableFrom(fromAddress: string): void {
  if (config.email.useMock) return;
  const domain = fromAddress.split('@')[1]?.toLowerCase() ?? '';
  if (!domain) throw Errors.badRequest('Invalid from-address');
  if (domain === 'resend.dev' || domain.endsWith('.resend.dev')) return;
  if (PLACEHOLDER_FROM_DOMAINS.has(domain)) {
    throw Errors.badRequest(
      `Refusing to send from placeholder domain "${domain}". Set EMAIL_FROM_ADDRESS to an address on your verified sending domain.`,
    );
  }
  const allow = config.email.verifiedDomains;
  if (allow.length > 0 && !allow.includes(domain)) {
    throw Errors.badRequest(
      `From-domain "${domain}" is not in EMAIL_VERIFIED_DOMAINS (${allow.join(', ')}). Use a verified sending domain.`,
    );
  }
}

export async function sendMessage(input: SendMessageInput, actor: Actor) {
  const resolved = await resolveSend(input);
  // An sdr may only send within campaigns they own.
  await assertCampaignSendable(resolved.campaignId, actor);
  const fromAddress = input.fromAddress ?? config.email.fromAddress;
  // Safe-by-default sender guard (no-op in mock mode).
  assertSendableFrom(fromAddress);

  // ── SUPPRESSION CHECK — runs before EVERY send, never skipped. ──
  if (await isSuppressed(resolved.toAddress, actor.companyId)) {
    // Record a suppressed message row for the audit trail; do not send.
    const blocked = await prisma.message.create({
      data: {
        contactId: resolved.contactId,
        campaignId: resolved.campaignId,
        sequenceStepId: resolved.sequenceStepId,
        draftId: resolved.draftId,
        direction: 'outbound',
        channel: 'email',
        fromAddress,
        toAddress: resolved.toAddress,
        subject: resolved.subject,
        body: resolved.body,
        status: 'suppressed',
      },
    });

    await writeAuditLog({
      entityType: 'message',
      entityId: blocked.id,
      action: 'message.suppressed',
      actorType: 'user',
      actorId: actor.id,
      summary: `Send blocked: ${resolved.toAddress} is suppressed`,
      ipAddress: actor.ipAddress,
    });

    throw Errors.conflict('Recipient is on the suppression list; send blocked');
  }

  // Create the message row first (status pending) so a provider failure still
  // leaves an auditable record.
  const message = await prisma.message.create({
    data: {
      contactId: resolved.contactId,
      campaignId: resolved.campaignId,
      sequenceStepId: resolved.sequenceStepId,
      draftId: resolved.draftId,
      direction: 'outbound',
      channel: 'email',
      fromAddress,
      toAddress: resolved.toAddress,
      subject: resolved.subject,
      body: resolved.body,
      status: 'pending',
    },
  });

  try {
    const result = await sendEmail({
      to: resolved.toAddress,
      from: fromAddress,
      subject: resolved.subject,
      body: resolved.body,
    });

    const sent = await prisma.message.update({
      where: { id: message.id },
      data: {
        status: 'sent',
        provider: result.provider,
        providerMessageId: result.providerMessageId,
        sentAt: new Date(),
      },
    });

    // Log the deliverability "sent" event.
    await prisma.deliverabilityEvent.create({
      data: {
        messageId: message.id,
        eventType: 'sent',
        provider: result.provider,
        eventAt: new Date(),
      },
    });

    // Advance draft + contact state.
    if (resolved.draftId) {
      await prisma.draft.update({
        where: { id: resolved.draftId },
        data: { status: 'sent' },
      });
    }
    await prisma.contact.update({
      where: { id: resolved.contactId },
      data: { status: 'contacted' },
    });

    await writeAuditLog({
      entityType: 'message',
      entityId: message.id,
      action: 'message.send',
      actorType: 'user',
      actorId: actor.id,
      summary: `Sent message to ${resolved.toAddress} via ${result.provider}`,
      payload: { provider: result.provider, providerMessageId: result.providerMessageId },
      ipAddress: actor.ipAddress,
    });

    return sent;
  } catch (err) {
    const providerMessage = err instanceof Error ? err.message : String(err);
    await prisma.message.update({
      where: { id: message.id },
      data: { status: 'failed' },
    });
    await writeAuditLog({
      entityType: 'message',
      entityId: message.id,
      action: 'message.send_failed',
      actorType: 'user',
      actorId: actor.id,
      summary: `Send failed to ${resolved.toAddress}: ${providerMessage}`,
      payload: { error: providerMessage },
      ipAddress: actor.ipAddress,
    });
    // Surface the provider's reason (e.g. unverified domain) so the operator can
    // act on it, rather than an opaque 500.
    throw Errors.badRequest(`Email send failed: ${providerMessage}`);
  }
}

export async function listMessages(params: ListMessagesInput, actor: Actor) {
  const { page, limit, status, direction, campaignId, contactId } = params;

  const where: Prisma.MessageWhereInput = {
    ...(status ? { status } : {}),
    ...(direction ? { direction } : {}),
    ...(campaignId ? { campaignId } : {}),
    ...(contactId ? { contactId } : {}),
    ...messageScope(actor),
  };

  const [items, total] = await Promise.all([
    prisma.message.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: { contact: { select: { id: true, name: true, email: true } } },
    }),
    prisma.message.count({ where }),
  ]);

  return {
    items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function getMessageById(id: string, actor: Actor) {
  const message = await prisma.message.findUnique({
    where: { id },
    include: {
      contact: { select: { id: true, name: true, email: true } },
      campaign: { select: { companyId: true, teamId: true } },
      deliveryEvents: { orderBy: { eventAt: 'asc' } },
    },
  });
  if (!message) throw Errors.notFound('Message not found');
  assertCanRead(actor, message.campaign, { team: true });
  return message;
}

export async function getMessageStatus(id: string, actor: Actor) {
  const message = await prisma.message.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      sentAt: true,
      openedAt: true,
      clickedAt: true,
      openCount: true,
      clickCount: true,
      provider: true,
      providerMessageId: true,
      campaign: { select: { companyId: true, teamId: true } },
    },
  });
  if (!message) throw Errors.notFound('Message not found');
  assertCanRead(actor, message.campaign, { team: true });
  return message;
}

// Ingest a provider tracking/deliverability event and update message state.
// Hard bounces auto-suppress the recipient (CLAUDE.md).
export async function recordEvent(id: string, input: RecordEventInput, actor: Actor) {
  const message = await prisma.message.findUnique({
    where: { id },
    include: {
      campaign: { select: { companyId: true, teamId: true } },
      contact: { select: { externalSource: true, externalId: true } },
    },
  });
  if (!message) throw Errors.notFound('Message not found');
  assertCanRead(actor, message.campaign, { team: true });

  const eventAt = input.eventAt ?? new Date();

  await prisma.deliverabilityEvent.create({
    data: {
      messageId: id,
      eventType: input.eventType,
      bounceType: input.bounceType,
      provider: message.provider,
      providerEventId: input.providerEventId,
      eventAt,
      providerPayloadJson: input.payload
        ? (input.payload as Prisma.InputJsonValue)
        : Prisma.JsonNull,
    },
  });

  // Apply the event to the message's tracking fields.
  const data: Prisma.MessageUpdateInput = {};
  switch (input.eventType) {
    case 'delivered':
      if (message.status === 'sent') data.status = 'delivered';
      break;
    case 'open':
      data.openedAt = message.openedAt ?? eventAt;
      data.openCount = { increment: 1 };
      break;
    case 'click':
      data.clickedAt = message.clickedAt ?? eventAt;
      data.clickCount = { increment: 1 };
      break;
    case 'bounce':
      data.status = 'bounced';
      break;
    default:
      break;
  }
  if (Object.keys(data).length > 0) {
    await prisma.message.update({ where: { id }, data });
  }

  // Hard bounce, complaint, or unsubscribe → suppress the recipient.
  const shouldSuppress =
    (input.eventType === 'bounce' && input.bounceType === 'hard') ||
    input.eventType === 'complaint' ||
    input.eventType === 'unsubscribe';

  if (shouldSuppress && message.toAddress) {
    await addSuppression(message.toAddress, {
      reason: input.eventType === 'bounce' ? 'hard_bounce' : input.eventType,
      source: 'deliverability',
      actor,
    });
  }

  await writeAuditLog({
    entityType: 'message',
    entityId: id,
    action: `message.event.${input.eventType}`,
    actorType: 'system',
    actorId: actor.id,
    summary: `Recorded ${input.eventType}${input.bounceType ? ` (${input.bounceType})` : ''} for message ${id}`,
    payload: { eventType: input.eventType, bounceType: input.bounceType },
    ipAddress: actor.ipAddress,
  });

  // Notify external systems (e.g. IGNITE-APEX CRM) of a bounce event.
  if (input.eventType === 'bounce') {
    await emitWebhook({
      eventType: 'bounce',
      entityType: 'message',
      entityId: id,
      companyId: message.campaign.companyId,
      externalSource: message.contact.externalSource,
      externalId: message.contact.externalId,
      payload: {
        bounceType: input.bounceType ?? null,
        toAddress: message.toAddress,
        contactId: message.contactId,
      },
    });
  }

  return getMessageStatus(id, actor);
}
