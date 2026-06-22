// Sending job: sends an APPROVED draft. Order is safety-critical (CLAUDE.md):
//   1. check the suppression list — NEVER skip
//   2. send via the email adapter
//   3. record the message + a deliverability "sent" event
// Idempotent: a draft already sent is skipped. On provider failure the message is
// marked failed and the job rethrows for retry.
import { prisma } from '@outreach/db';
import { getEmailAdapter, integrationsConfig } from '@outreach/integrations';
import { logger } from '../logger';
import { writeAudit, auditJobStart } from '../audit';
import type { JobPayloads } from '../config/queues';

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function sendingJob(data: JobPayloads['sending']): Promise<void> {
  const { draftId } = data;
  const end = await auditJobStart('draft', draftId, 'sending');

  try {
    const draft = await prisma.draft.findUnique({
      where: { id: draftId },
      include: {
        contact: { select: { id: true, email: true } },
        campaign: { select: { companyId: true } },
      },
    });
    if (!draft) {
      logger.warn('sending: draft not found', { draftId });
      await end();
      return;
    }
    // Idempotency + safety: only approved drafts are sendable; sent ones are done.
    if (draft.status === 'sent') {
      await end();
      return;
    }
    if (draft.status !== 'approved') {
      logger.warn('sending: draft not approved, skipping', { draftId, status: draft.status });
      await end();
      return;
    }
    if (!draft.contact.email) {
      logger.warn('sending: contact has no email', { draftId });
      await end();
      return;
    }

    const toAddress = draft.contact.email;
    const fromAddress = integrationsConfig.email.fromAddress;

    // ── SUPPRESSION CHECK — before EVERY send, never skipped. Per-company. ──
    const companyId = draft.campaign.companyId;
    const suppressed = await prisma.suppressionList.findUnique({
      where: { companyId_email: { companyId, email: normalizeEmail(toAddress) } },
      select: { id: true },
    });
    if (suppressed) {
      await prisma.message.create({
        data: {
          contactId: draft.contactId,
          campaignId: draft.campaignId,
          sequenceStepId: draft.sequenceStepId,
          draftId: draft.id,
          direction: 'outbound',
          channel: 'email',
          fromAddress,
          toAddress,
          subject: draft.subject,
          body: draft.body,
          status: 'suppressed',
        },
      });
      await writeAudit({
        entityType: 'draft',
        entityId: draftId,
        action: 'message.suppressed',
        summary: `Send blocked: ${toAddress} is suppressed`,
      });
      await end();
      return;
    }

    // Create the message row first (status pending) for an auditable record.
    const message = await prisma.message.create({
      data: {
        contactId: draft.contactId,
        campaignId: draft.campaignId,
        sequenceStepId: draft.sequenceStepId,
        draftId: draft.id,
        direction: 'outbound',
        channel: 'email',
        fromAddress,
        toAddress,
        subject: draft.subject,
        body: draft.body,
        status: 'pending',
      },
    });

    try {
      const adapter = getEmailAdapter();
      const result = await adapter.send({
        to: toAddress,
        from: fromAddress,
        subject: draft.subject ?? '',
        body: draft.body ?? '',
        replyTo: integrationsConfig.email.replyTo,
        referenceId: message.id,
      });

      await prisma.message.update({
        where: { id: message.id },
        data: {
          status: 'sent',
          provider: result.provider,
          providerMessageId: result.providerMessageId,
          sentAt: new Date(),
        },
      });
      await prisma.deliverabilityEvent.create({
        data: {
          messageId: message.id,
          eventType: 'sent',
          provider: result.provider,
          eventAt: new Date(),
        },
      });
      await prisma.draft.update({ where: { id: draft.id }, data: { status: 'sent' } });
      await prisma.contact.update({
        where: { id: draft.contactId },
        data: { status: 'contacted' },
      });

      await writeAudit({
        entityType: 'message',
        entityId: message.id,
        action: 'message.send',
        summary: `Sent to ${toAddress} via ${result.provider}`,
        payload: { provider: result.provider, providerMessageId: result.providerMessageId },
      });

      await end();
    } catch (sendErr) {
      await prisma.message.update({ where: { id: message.id }, data: { status: 'failed' } });
      await writeAudit({
        entityType: 'message',
        entityId: message.id,
        action: 'message.send_failed',
        summary: `Send failed to ${toAddress}`,
      });
      throw sendErr;
    }
  } catch (err) {
    logger.error('sending job failed', {
      draftId,
      message: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
