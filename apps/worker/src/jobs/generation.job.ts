// Generation job: runs the AI pipeline (research → draft → quality) and creates a
// pending_review Draft. Per CLAUDE.md drafts are NEVER auto-sent — they queue for
// human approval. Idempotent: if a pending/approved draft already exists for the
// same (contact, campaign, step) it is left alone.
import { Prisma, prisma } from '@outreach/db';
import { generateResearchBrief, generateDraft, evaluateDraft, productContextFrom } from '@outreach/ai';
import type {
  TouchIntent,
  TouchBranding,
  TouchType,
  CampaignBriefContext,
  BuyerPersonaContext,
  CtaContext,
  CtaType,
} from '@outreach/ai';
import { logger } from '../logger';
import { writeAudit, auditJobStart } from '../audit';
import type { JobPayloads } from '../config/queues';

export async function generationJob(data: JobPayloads['generation']): Promise<void> {
  const { contactId, campaignId, sequenceStepId } = data;
  const end = await auditJobStart('contact', contactId, 'generation', { campaignId });

  try {
    // Idempotency: skip if a live draft already exists for this touch.
    const existing = await prisma.draft.findFirst({
      where: {
        contactId,
        campaignId,
        sequenceStepId: sequenceStepId ?? null,
        status: { in: ['pending_review', 'approved', 'sent'] },
      },
      select: { id: true },
    });
    if (existing) {
      logger.info('generation: draft already exists, skipping', { draftId: existing.id });
      await end();
      return;
    }

    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: {
        id: true,
        persona: true,
        companyId: true,
        company: { select: { settingsJson: true } },
        brief: true,
      },
    });
    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
      include: { account: { select: { name: true } } },
    });
    if (!campaign || !contact) {
      logger.warn('generation: missing campaign or contact', { contactId, campaignId });
      await end();
      return;
    }

    // Framework + Campaign-Brief strategy constraints from the touch (default
    // strictest: an ops-intel trust-builder).
    let intent: TouchIntent = 'ops_intel';
    let branding: TouchBranding = 'signature_only';
    let touchType: TouchType = 'trust_builder';
    let cta: CtaContext | null = null;
    if (sequenceStepId) {
      const step = await prisma.sequenceStep.findUnique({
        where: { id: sequenceStepId },
        select: { intent: true, branding: true, touchType: true, ctaType: true, ctaConfigJson: true },
      });
      if (step) {
        intent = step.intent as TouchIntent;
        branding = step.branding as TouchBranding;
        touchType = (step.touchType as TouchType) ?? 'trust_builder';
        if (step.touchType === 'cta' && step.ctaType) {
          cta = {
            type: step.ctaType as CtaType,
            config: (step.ctaConfigJson as Record<string, unknown> | null) ?? null,
          };
        }
      }
    }

    // Structured brief + persona context from the campaign's brief (if any).
    const b = campaign.brief;
    const brief: CampaignBriefContext | null = b
      ? {
          productPurpose: b.productPurpose,
          targetCustomer: b.targetCustomer,
          u1Unworkable: b.u1Unworkable,
          u2Urgent: b.u2Urgent,
          u3Unavoidable: b.u3Unavoidable,
          u4Underserved: b.u4Underserved,
          positioningStatement: b.positioningStatement,
        }
      : null;
    const buyerPersona: BuyerPersonaContext | null = b
      ? {
          industry: b.industry,
          companySize: b.companySize,
          seniority: b.economicBuyerSeniority,
          designation: b.economicBuyerDesignation,
        }
      : null;

    const md = (contact.metadataJson ?? null) as { painPoints?: string } | null;
    // Generic product/market context for this tenant (no hardcoded vendor).
    const product = productContextFrom(campaign.company?.settingsJson ?? null);
    const base = {
      contactName: contact.name,
      company: contact.account?.name ?? null,
      title: contact.title,
      painPoints: md?.painPoints ?? null,
      product,
      companyId: campaign.companyId,
    };

    let tokens = 0;
    let latencyMs = 0;

    const research = await generateResearchBrief(base);
    const researchBrief = research.ok ? research.brief : null;
    if (research.ok) {
      tokens += research.meta.totalTokens;
      latencyMs += research.meta.latencyMs;
    }

    const draftRes = await generateDraft({
      ...base,
      persona: campaign.persona,
      researchBrief,
      intent,
      branding,
      touchType,
      brief,
      buyerPersona,
      cta,
    });
    if (!draftRes.ok) {
      throw new Error(`AI draft generation failed: ${draftRes.error.message}`);
    }
    tokens += draftRes.meta.totalTokens;
    latencyMs += draftRes.meta.latencyMs;

    const evalRes = await evaluateDraft({
      contactName: contact.name,
      company: contact.account?.name ?? null,
      subject: draftRes.subject,
      body: draftRes.body,
      companyId: campaign.companyId,
    });
    let qualityScore: number | null = null;
    let personalizationScore: number | null = null;
    if (evalRes.ok) {
      qualityScore = evalRes.qualityScore;
      personalizationScore = evalRes.personalizationScore;
      tokens += evalRes.meta.totalTokens;
      latencyMs += evalRes.meta.latencyMs;
    }

    const draft = await prisma.draft.create({
      data: {
        contactId,
        campaignId,
        sequenceStepId: sequenceStepId ?? null,
        status: 'pending_review',
        subject: draftRes.subject,
        body: draftRes.body,
        researchBrief,
        promptVersionId: draftRes.meta.promptVersionId,
        qualityScore: qualityScore != null ? new Prisma.Decimal(qualityScore) : null,
        personalizationScore:
          personalizationScore != null ? new Prisma.Decimal(personalizationScore) : null,
        aiTokensUsed: tokens > 0 ? tokens : null,
        aiLatencyMs: latencyMs > 0 ? latencyMs : null,
      },
    });

    await writeAudit({
      entityType: 'draft',
      entityId: draft.id,
      action: 'draft.generate',
      summary: `Worker generated draft for contact ${contactId} (queued for review)`,
      payload: { promptVersionId: draftRes.meta.promptVersionId, qualityScore, aiTokensUsed: tokens },
    });

    await end();
  } catch (err) {
    logger.error('generation job failed', {
      contactId,
      message: err instanceof Error ? err.message : String(err),
    });
    await writeAudit({
      entityType: 'contact',
      entityId: contactId,
      action: 'draft.generate_failed',
      summary: 'Draft generation failed',
    });
    throw err;
  }
}
