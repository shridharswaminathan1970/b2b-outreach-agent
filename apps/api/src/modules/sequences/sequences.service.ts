// Sequences business logic: CRUD for sequences plus management of their ordered
// steps. Steps are created/replaced atomically and totalSteps is kept in sync.
import { Prisma } from '@outreach/db';
import { prisma } from '../../config/database';
import { Errors } from '../../utils/response';
import { writeAuditLog } from '../audit/audit.service';
import { type Actor, scopeWhere, assertCanRead, assertCanWrite } from '../../utils/tenancy';
import type {
  ListSequencesInput,
  CreateSequenceInput,
  UpdateSequenceInput,
  StepInput,
  EnrollAudienceInput,
} from './sequences.schema';

export type { Actor };

// where-fragment restricting sequences to those whose campaign the actor owns.
function sequenceScope(actor: Actor): Prisma.SequenceWhereInput {
  return { campaign: scopeWhere(actor, { team: true }) };
}

// Map a validated step + its 1-based order into a createMany row.
function toStepRow(
  step: StepInput,
  order: number,
  sequenceId: string,
): Prisma.SequenceStepCreateManyInput {
  return {
    sequenceId,
    stepOrder: order,
    channel: step.channel,
    delayHours: step.delayHours,
    delayType: step.delayType,
    subject: step.subject ?? null,
    bodyOverride: step.bodyOverride ?? null,
    templateId: step.templateId ?? null,
    stopConditions:
      step.stopConditions == null
        ? Prisma.JsonNull
        : (step.stopConditions as Prisma.InputJsonValue),
    intent: step.intent,
    branding: step.branding,
  };
}

export async function listSequences(params: ListSequencesInput, actor: Actor) {
  const { page, limit, campaignId, status } = params;

  const where: Prisma.SequenceWhereInput = {
    ...(campaignId ? { campaignId } : {}),
    ...(status ? { status } : {}),
    ...sequenceScope(actor),
  };

  const [items, total] = await Promise.all([
    prisma.sequence.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: { _count: { select: { steps: true, enrollments: true } } },
    }),
    prisma.sequence.count({ where }),
  ]);

  return {
    items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function getSequenceById(id: string, actor: Actor) {
  const sequence = await prisma.sequence.findUnique({
    where: { id },
    include: {
      steps: { orderBy: { stepOrder: 'asc' } },
      campaign: { select: { companyId: true, teamId: true } },
    },
  });
  if (!sequence) throw Errors.notFound('Sequence not found');
  assertCanRead(actor, sequence.campaign, { team: true });
  return sequence;
}

export async function createSequence(input: CreateSequenceInput, actor: Actor) {
  // Sequence must belong to an existing campaign the actor can access.
  const campaign = await prisma.campaign.findUnique({
    where: { id: input.campaignId },
    select: { id: true, companyId: true, teamId: true },
  });
  if (!campaign) throw Errors.badRequest('campaignId does not reference a campaign');
  assertCanWrite(actor, campaign, { team: true });

  const steps = input.steps ?? [];

  const sequence = await prisma.$transaction(async (tx) => {
    const created = await tx.sequence.create({
      data: {
        campaignId: input.campaignId,
        name: input.name,
        description: input.description,
        totalSteps: steps.length,
      },
    });

    if (steps.length > 0) {
      await tx.sequenceStep.createMany({
        data: steps.map((s, i) => toStepRow(s, i + 1, created.id)),
      });
    }

    return tx.sequence.findUniqueOrThrow({
      where: { id: created.id },
      include: { steps: { orderBy: { stepOrder: 'asc' } } },
    });
  });

  await writeAuditLog({
    entityType: 'sequence',
    entityId: sequence.id,
    action: 'sequence.create',
    actorType: 'user',
    actorId: actor.id,
    summary: `Created sequence ${sequence.name} with ${steps.length} step(s)`,
    ipAddress: actor.ipAddress,
  });

  return sequence;
}

export async function updateSequence(
  id: string,
  input: UpdateSequenceInput,
  actor: Actor,
) {
  const existing = await getSequenceById(id, actor);
  assertCanWrite(actor, existing.campaign, { team: true });

  const sequence = await prisma.sequence.update({
    where: { id },
    data: { ...input },
    include: { steps: { orderBy: { stepOrder: 'asc' } } },
  });

  await writeAuditLog({
    entityType: 'sequence',
    entityId: sequence.id,
    action: 'sequence.update',
    actorType: 'user',
    actorId: actor.id,
    summary: `Updated sequence ${sequence.name}: ${Object.keys(input).join(', ')}`,
    payload: { changedFields: Object.keys(input) },
    ipAddress: actor.ipAddress,
  });

  return sequence;
}

// Replace the entire ordered step list for a sequence (atomic).
export async function replaceSteps(id: string, steps: StepInput[], actor: Actor) {
  const existing = await getSequenceById(id, actor);
  assertCanWrite(actor, existing.campaign, { team: true });

  const sequence = await prisma.$transaction(async (tx) => {
    await tx.sequenceStep.deleteMany({ where: { sequenceId: id } });
    if (steps.length > 0) {
      await tx.sequenceStep.createMany({
        data: steps.map((s, i) => toStepRow(s, i + 1, id)),
      });
    }
    return tx.sequence.update({
      where: { id },
      data: { totalSteps: steps.length },
      include: { steps: { orderBy: { stepOrder: 'asc' } } },
    });
  });

  await writeAuditLog({
    entityType: 'sequence',
    entityId: id,
    action: 'sequence.replace_steps',
    actorType: 'user',
    actorId: actor.id,
    summary: `Replaced steps for ${sequence.name} (${steps.length} step(s))`,
    payload: { totalSteps: steps.length },
    ipAddress: actor.ipAddress,
  });

  return sequence;
}

// Enroll an audience into a sequence (the wizard's Audience + Schedule steps).
// Creates active CampaignEnrollment rows the worker's follow-up poller will pick
// up. Idempotent: contacts already actively enrolled in this sequence are skipped;
// contacts outside the actor's scope or suppressed are skipped. Activating the
// sequence (status → active) is part of enrolling.
export async function enrollAudience(id: string, input: EnrollAudienceInput, actor: Actor) {
  const sequence = await getSequenceById(id, actor);
  assertCanWrite(actor, sequence.campaign, { team: true });

  if (sequence.steps.length === 0) {
    throw Errors.badRequest('Add at least one step before enrolling contacts');
  }
  const firstStep = sequence.steps[0]; // ordered by stepOrder asc

  // Only contacts inside the actor's tenant/team scope, and not suppressed.
  const contacts = await prisma.contact.findMany({
    where: { id: { in: input.contactIds }, ...scopeWhere(actor, { team: true }), suppressed: false },
    select: { id: true },
  });
  const validIds = contacts.map((c) => c.id);

  // Skip contacts already actively enrolled in this sequence.
  const existing = await prisma.campaignEnrollment.findMany({
    where: { sequenceId: id, contactId: { in: validIds }, status: 'active' },
    select: { contactId: true },
  });
  const existingSet = new Set(existing.map((e) => e.contactId));
  const toEnroll = validIds.filter((cid) => !existingSet.has(cid));

  const nextSendAt = input.startAt ?? new Date();

  if (toEnroll.length > 0) {
    await prisma.campaignEnrollment.createMany({
      data: toEnroll.map((contactId) => ({
        campaignId: sequence.campaignId,
        contactId,
        sequenceId: id,
        enrolledBy: actor.id,
        currentStep: 0,
        nextStepId: firstStep.id,
        nextSendAt,
        status: 'active',
        paused: false,
      })),
    });
  }

  if (sequence.status !== 'active') {
    await prisma.sequence.update({ where: { id }, data: { status: 'active' } });
  }

  await writeAuditLog({
    entityType: 'sequence',
    entityId: id,
    action: 'sequence.enroll',
    actorType: 'user',
    actorId: actor.id,
    summary: `Enrolled ${toEnroll.length} contact(s) into ${sequence.name}`,
    payload: {
      enrolled: toEnroll.length,
      skippedExisting: validIds.length - toEnroll.length,
      skippedInvalid: input.contactIds.length - validIds.length,
      startAt: nextSendAt,
    },
    ipAddress: actor.ipAddress,
  });

  return {
    sequenceId: id,
    enrolled: toEnroll.length,
    skippedAlreadyEnrolled: validIds.length - toEnroll.length,
    skippedOutOfScopeOrSuppressed: input.contactIds.length - validIds.length,
    startAt: nextSendAt,
  };
}

export async function deleteSequence(id: string, actor: Actor) {
  const sequence = await getSequenceById(id, actor);
  assertCanWrite(actor, sequence.campaign, { team: true });

  // Block deletion if contacts are actively enrolled in this sequence.
  const enrollments = await prisma.campaignEnrollment.count({
    where: { sequenceId: id },
  });
  if (enrollments > 0) {
    throw Errors.conflict(
      `Sequence has ${enrollments} enrollment(s); cannot delete while in use`,
    );
  }

  // Steps cascade-delete via the FK relation.
  await prisma.sequence.delete({ where: { id } });

  await writeAuditLog({
    entityType: 'sequence',
    entityId: id,
    action: 'sequence.delete',
    actorType: 'user',
    actorId: actor.id,
    summary: `Deleted sequence ${sequence.name}`,
    ipAddress: actor.ipAddress,
  });

  return { deleted: true };
}
