// Campaign Brief business logic: create a whole campaign from a structured brief
// (Campaign + CampaignBrief + Sequence + auto-assigned steps), read/update the
// brief, and regenerate the sequence from the strategy. The 80/20 trust:CTA
// split places CTA touches at the END of the sequence.
import { Prisma } from '@outreach/db';
import { prisma } from '../../config/database';
import { Errors } from '../../utils/response';
import { writeAuditLog } from '../audit/audit.service';
import { type Actor, assertCanWrite, canWrite } from '../../utils/tenancy';
import { getCampaignById } from './campaigns.service';
import type {
  CreateFromBriefInput,
  UpdateBriefInput,
  RegenerateSequenceInput,
  CtaTouchInput,
  StrategyInput,
} from './brief.schema';

// Touch types rotated through the trust block (the 80%).
const TRUST_ROTATION = ['trust_builder', 'value_add', 'intel_gathering'] as const;
// Default spacing between touches (business hours). First touch sends immediately.
const STEP_SPACING_HOURS = 72;

interface PlannedStep {
  stepOrder: number;
  touchType: string;
  intent: string;
  branding: string;
  ctaType: string | null;
  config: Record<string, unknown> | null;
}

// Split N touchpoints into a trust block (first ~trustRatio) and a CTA block (the
// rest, always at least 1), assigning touch metadata. CTA configs are applied to
// the CTA block in order.
export function computeSequencePlan(
  total: number,
  trustRatio: number,
  ctaTouches: CtaTouchInput[],
): PlannedStep[] {
  const ctaCount = Math.min(total, Math.max(1, Math.round(total * (1 - trustRatio))));
  const trustCount = total - ctaCount;

  const steps: PlannedStep[] = [];
  for (let i = 0; i < total; i++) {
    const stepOrder = i + 1;
    if (i < trustCount) {
      steps.push({
        stepOrder,
        touchType: TRUST_ROTATION[i % TRUST_ROTATION.length],
        intent: 'ops_intel',
        branding: 'signature_only',
        ctaType: null,
        config: null,
      });
    } else {
      const cta = ctaTouches[i - trustCount];
      steps.push({
        stepOrder,
        touchType: 'cta',
        intent: 'soft_positioning',
        branding: 'inline',
        ctaType: cta?.ctaType ?? null,
        config: (cta?.config as Record<string, unknown> | undefined) ?? null,
      });
    }
  }
  return steps;
}

function toStepRow(p: PlannedStep, sequenceId: string): Prisma.SequenceStepCreateManyInput {
  return {
    sequenceId,
    stepOrder: p.stepOrder,
    channel: 'email',
    delayHours: p.stepOrder === 1 ? 0 : STEP_SPACING_HOURS,
    delayType: 'business_hours',
    intent: p.intent,
    branding: p.branding,
    touchType: p.touchType,
    ctaType: p.ctaType,
    ctaConfigJson: p.config == null ? Prisma.JsonNull : (p.config as Prisma.InputJsonValue),
  };
}

// Brief column values shared by create + update (product brief + persona).
function briefScalars(
  product: Partial<CreateFromBriefInput['productBrief']>,
  persona: Partial<CreateFromBriefInput['buyerPersona']>,
) {
  return {
    productName: product.productName,
    productPurpose: product.productPurpose,
    targetCustomer: product.targetCustomer,
    u1Unworkable: product.u1Unworkable,
    u2Urgent: product.u2Urgent,
    u3Unavoidable: product.u3Unavoidable,
    u4Underserved: product.u4Underserved,
    positioningStatement: product.positioningStatement,
    industry: persona.industry,
    companySize: persona.companySize,
    economicBuyerName: persona.economicBuyerName,
    economicBuyerDesignation: persona.economicBuyerDesignation,
    economicBuyerSeniority: persona.economicBuyerSeniority,
    economicBuyerEmail: persona.economicBuyerEmail,
    coDecisionMakerName: persona.coDecisionMakerName,
    coDecisionMakerDesignation: persona.coDecisionMakerDesignation,
    coDecisionMakerEmail: persona.coDecisionMakerEmail,
  };
}

export async function createCampaignFromBrief(input: CreateFromBriefInput, actor: Actor) {
  if (!canWrite(actor.role)) throw Errors.forbidden('Your role may not create campaigns');

  const { strategy } = input;
  const plan = computeSequencePlan(
    strategy.totalTouchpoints,
    strategy.trustRatio,
    strategy.ctaTouches,
  );

  const result = await prisma.$transaction(async (tx) => {
    const campaign = await tx.campaign.create({
      data: {
        companyId: actor.companyId,
        teamId: actor.teamId,
        createdBy: actor.id,
        ownerUserId: actor.id,
        name: input.name,
        objective: input.objective ?? null,
        persona: input.persona ?? null,
        status: 'draft',
      },
    });

    await tx.campaignBrief.create({
      data: {
        campaignId: campaign.id,
        ...briefScalars(input.productBrief, input.buyerPersona),
        totalTouchpoints: strategy.totalTouchpoints,
        trustRatio: strategy.trustRatio,
      } as Prisma.CampaignBriefUncheckedCreateInput,
    });

    const sequence = await tx.sequence.create({
      data: {
        campaignId: campaign.id,
        name: `${input.name} — Sequence`,
        totalSteps: plan.length,
        status: 'draft',
      },
    });
    await tx.sequenceStep.createMany({ data: plan.map((p) => toStepRow(p, sequence.id)) });

    return { campaignId: campaign.id };
  });

  await writeAuditLog({
    entityType: 'campaign',
    entityId: result.campaignId,
    action: 'campaign.create_from_brief',
    actorType: 'user',
    actorId: actor.id,
    summary: `Created campaign "${input.name}" from brief (${plan.length} touches, ${plan.filter((p) => p.touchType === 'cta').length} CTA)`,
    payload: { totalTouchpoints: strategy.totalTouchpoints, trustRatio: strategy.trustRatio },
    ipAddress: actor.ipAddress,
  });

  return getBrief(result.campaignId, actor);
}

// Return the campaign's brief plus its (first) sequence with ordered steps.
export async function getBrief(campaignId: string, actor: Actor) {
  const campaign = await getCampaignById(campaignId, actor); // enforces read scope
  const brief = await prisma.campaignBrief.findUnique({ where: { campaignId } });
  const sequence = await prisma.sequence.findFirst({
    where: { campaignId },
    orderBy: { createdAt: 'asc' },
    include: { steps: { orderBy: { stepOrder: 'asc' } } },
  });
  return { campaign, brief, sequence };
}

export async function updateBrief(campaignId: string, input: UpdateBriefInput, actor: Actor) {
  const campaign = await getCampaignById(campaignId, actor);
  assertCanWrite(actor, campaign, { team: true });

  const existing = await prisma.campaignBrief.findUnique({ where: { campaignId } });
  if (!existing) throw Errors.notFound('This campaign has no brief');

  // Only set keys that were provided (all update fields are optional).
  const data: Prisma.CampaignBriefUncheckedUpdateInput = {};
  for (const [k, v] of Object.entries(input)) {
    if (v !== undefined) (data as Record<string, unknown>)[k] = v;
  }

  await prisma.campaignBrief.update({ where: { campaignId }, data });

  await writeAuditLog({
    entityType: 'campaign',
    entityId: campaignId,
    action: 'campaign.brief_update',
    actorType: 'user',
    actorId: actor.id,
    summary: `Updated brief: ${Object.keys(input).join(', ')}`,
    payload: { changedFields: Object.keys(input) },
    ipAddress: actor.ipAddress,
  });

  return getBrief(campaignId, actor);
}

// Rebuild the sequence steps from the strategy (optionally overriding the
// touchpoint count / ratio / CTA configs). Blocked once contacts are enrolled.
export async function regenerateSequence(
  campaignId: string,
  input: RegenerateSequenceInput,
  actor: Actor,
) {
  const campaign = await getCampaignById(campaignId, actor);
  assertCanWrite(actor, campaign, { team: true });

  const brief = await prisma.campaignBrief.findUnique({ where: { campaignId } });
  if (!brief) throw Errors.notFound('This campaign has no brief');

  const sequence = await prisma.sequence.findFirst({
    where: { campaignId },
    orderBy: { createdAt: 'asc' },
  });
  if (!sequence) throw Errors.notFound('This campaign has no sequence');

  const enrolled = await prisma.campaignEnrollment.count({ where: { sequenceId: sequence.id } });
  if (enrolled > 0) {
    throw Errors.conflict(`Sequence has ${enrolled} enrollment(s); cannot regenerate while in use`);
  }

  const total = input.totalTouchpoints ?? brief.totalTouchpoints;
  const trustRatio = input.trustRatio ?? brief.trustRatio;
  // Reuse existing CTA configs when none are supplied.
  const ctaTouches: CtaTouchInput[] =
    input.ctaTouches ??
    (await prisma.sequenceStep.findMany({
      where: { sequenceId: sequence.id, touchType: 'cta' },
      orderBy: { stepOrder: 'asc' },
    }).then((steps) =>
      steps
        .filter((st) => st.ctaType)
        .map((st) => ({
          ctaType: st.ctaType as CtaTouchInput['ctaType'],
          config: (st.ctaConfigJson as Record<string, unknown> | null) ?? undefined,
        })),
    ));

  const plan = computeSequencePlan(total, trustRatio, ctaTouches);

  await prisma.$transaction(async (tx) => {
    await tx.sequenceStep.deleteMany({ where: { sequenceId: sequence.id } });
    await tx.sequenceStep.createMany({ data: plan.map((p) => toStepRow(p, sequence.id)) });
    await tx.sequence.update({ where: { id: sequence.id }, data: { totalSteps: plan.length } });
    if (input.totalTouchpoints !== undefined || input.trustRatio !== undefined) {
      await tx.campaignBrief.update({
        where: { campaignId },
        data: { totalTouchpoints: total, trustRatio },
      });
    }
  });

  await writeAuditLog({
    entityType: 'campaign',
    entityId: campaignId,
    action: 'campaign.sequence_regenerate',
    actorType: 'user',
    actorId: actor.id,
    summary: `Regenerated sequence (${plan.length} touches)`,
    payload: { totalTouchpoints: total, trustRatio },
    ipAddress: actor.ipAddress,
  });

  return getBrief(campaignId, actor);
}

export type { StrategyInput };
