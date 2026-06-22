// Sequence processor: advances a single campaign enrollment by one step. Honors
// stop conditions (reply / unsubscribe), enqueues draft generation for the next
// touch, and schedules the following touch's send time. Closes the enrollment
// when the sequence is exhausted. Idempotent per call (operates on current state).
import { prisma } from '@outreach/db';
import { logger } from '../logger';
import { writeAudit } from '../audit';
import { enqueue, QUEUES } from '../config/queues';

interface StopConditions {
  on_reply?: boolean;
  on_unsubscribe?: boolean;
}

// Has the contact replied within this campaign? (drives on_reply stop condition)
async function hasReplied(contactId: string, campaignId: string): Promise<boolean> {
  const reply = await prisma.reply.findFirst({
    where: { contactId, message: { campaignId } },
    select: { id: true },
  });
  return Boolean(reply);
}

async function closeEnrollment(id: string, status: string, reason: string): Promise<void> {
  await prisma.campaignEnrollment.update({
    where: { id },
    data: { status, stopReason: reason, completedAt: new Date(), nextSendAt: null, nextStepId: null },
  });
  await writeAudit({
    entityType: 'enrollment',
    entityId: id,
    action: `enrollment.${status}`,
    summary: `Enrollment ${status}: ${reason}`,
    payload: { status, reason },
  });
}

// Advance one enrollment. Returns a short status string for logging.
export async function advanceEnrollment(enrollmentId: string): Promise<string> {
  const enrollment = await prisma.campaignEnrollment.findUnique({
    where: { id: enrollmentId },
    include: {
      contact: { select: { id: true, suppressed: true } },
      sequence: { include: { steps: { orderBy: { stepOrder: 'asc' } } } },
    },
  });
  if (!enrollment) return 'not_found';
  if (enrollment.status !== 'active' || enrollment.paused) return 'inactive';

  // ── Stop conditions ──
  const nextOrder = enrollment.currentStep + 1;
  const nextStep = enrollment.sequence.steps.find((s) => s.stepOrder === nextOrder);
  const stop = (nextStep?.stopConditions ?? {}) as StopConditions;

  if (enrollment.contact.suppressed && stop.on_unsubscribe !== false) {
    await closeEnrollment(enrollmentId, 'stopped', 'contact_suppressed');
    return 'stopped_suppressed';
  }
  if (stop.on_reply && (await hasReplied(enrollment.contactId, enrollment.campaignId))) {
    await closeEnrollment(enrollmentId, 'stopped', 'contact_replied');
    return 'stopped_replied';
  }

  // ── No more steps → complete ──
  if (!nextStep) {
    await closeEnrollment(enrollmentId, 'completed', 'sequence_finished');
    return 'completed';
  }

  // ── Generate the draft for this touch (queued for human approval) ──
  await enqueue(QUEUES.generation, {
    contactId: enrollment.contactId,
    campaignId: enrollment.campaignId,
    sequenceStepId: nextStep.id,
  });

  // Schedule the following touch's send time from its delayHours.
  const followingStep = enrollment.sequence.steps.find((s) => s.stepOrder === nextOrder + 1);
  const nextSendAt = followingStep
    ? new Date(Date.now() + followingStep.delayHours * 60 * 60 * 1000)
    : null;

  await prisma.campaignEnrollment.update({
    where: { id: enrollmentId },
    data: {
      currentStep: nextOrder,
      nextStepId: followingStep?.id ?? null,
      nextSendAt,
    },
  });

  await writeAudit({
    entityType: 'enrollment',
    entityId: enrollmentId,
    action: 'enrollment.advance',
    summary: `Advanced to step ${nextOrder}; generation queued`,
    payload: { step: nextOrder, sequenceStepId: nextStep.id },
  });

  logger.info('enrollment advanced', { enrollmentId, step: nextOrder });
  return 'advanced';
}
