// Scoring job: applies the campaign's ICP rules to a contact, writes the score +
// reason, and routes low-scoring contacts to manual review. Idempotent (pure
// function of current contact/account/campaign state). ICP rules shape (see seed
// + campaigns.icpRulesJson): { seniority: string[], sizeBand: string[] }.
import { prisma } from '@outreach/db';
import { logger } from '../logger';
import { writeAudit, auditJobStart } from '../audit';
import type { JobPayloads } from '../config/queues';

// Below this score a contact is routed to review rather than auto-enrolled.
const REVIEW_THRESHOLD = 50;

interface IcpRules {
  seniority?: string[];
  sizeBand?: string[];
}

// Find the ICP rules to score against: the named campaign, else any active
// campaign the contact is enrolled in, else null (generic fallback).
async function resolveIcpRules(
  contactId: string,
  campaignId?: string,
): Promise<IcpRules | null> {
  if (campaignId) {
    const c = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { icpRulesJson: true },
    });
    return (c?.icpRulesJson as IcpRules) ?? null;
  }
  const enrollment = await prisma.campaignEnrollment.findFirst({
    where: { contactId },
    select: { campaign: { select: { icpRulesJson: true } } },
  });
  return (enrollment?.campaign.icpRulesJson as IcpRules) ?? null;
}

export async function scoringJob(data: JobPayloads['scoring']): Promise<void> {
  const { contactId, campaignId } = data;
  const end = await auditJobStart('contact', contactId, 'scoring', { campaignId });

  try {
    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
      include: { account: { select: { sizeBand: true } } },
    });
    if (!contact) {
      logger.warn('scoring: contact not found', { contactId });
      await end();
      return;
    }

    const rules = await resolveIcpRules(contactId, campaignId);

    let score: number;
    const reasons: string[] = [];

    if (rules && (rules.seniority?.length || rules.sizeBand?.length)) {
      const seniorityMatch =
        !rules.seniority?.length ||
        (contact.seniority ? rules.seniority.includes(contact.seniority) : false);
      const sizeMatch =
        !rules.sizeBand?.length ||
        (contact.account?.sizeBand ? rules.sizeBand.includes(contact.account.sizeBand) : false);

      score = (seniorityMatch ? 50 : 0) + (sizeMatch ? 50 : 0);
      reasons.push(`seniority ${seniorityMatch ? 'match' : 'miss'} (${contact.seniority ?? 'n/a'})`);
      reasons.push(`size ${sizeMatch ? 'match' : 'miss'} (${contact.account?.sizeBand ?? 'n/a'})`);
    } else {
      // Generic fallback when no ICP rules are defined.
      const senior = ['c_suite', 'vp', 'director'].includes(contact.seniority ?? '');
      score = senior ? 70 : 30;
      reasons.push(`no ICP rules; seniority-based (${contact.seniority ?? 'n/a'})`);
    }

    const routedToReview = score < REVIEW_THRESHOLD;
    await prisma.contact.update({
      where: { id: contactId },
      data: {
        icpScore: score,
        icpScoreReason: reasons.join('; '),
        // Only nudge status for new/unscored contacts; don't disturb in-flight ones.
        ...(contact.status === 'new'
          ? { status: routedToReview ? 'review' : 'qualified' }
          : {}),
      },
    });

    await writeAudit({
      entityType: 'contact',
      entityId: contactId,
      action: 'contact.scored',
      summary: `ICP score ${score} (${routedToReview ? 'review' : 'qualified'})`,
      payload: { score, routedToReview, reasons },
    });

    await end();
  } catch (err) {
    logger.error('scoring job failed', {
      contactId,
      message: err instanceof Error ? err.message : String(err),
    });
    await writeAudit({
      entityType: 'contact',
      entityId: contactId,
      action: 'contact.score_failed',
      summary: 'Scoring failed',
    });
    throw err;
  }
}
