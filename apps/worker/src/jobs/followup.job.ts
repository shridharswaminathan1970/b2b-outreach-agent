// Followup job (polling): finds enrollments whose next touch is due and advances
// each via the sequence processor (which generates the next draft or closes the
// enrollment). Idempotent — operates on current enrollment state; a contact's
// nextSendAt is moved forward as it advances so it isn't reprocessed.
import { prisma } from '@outreach/db';
import { logger } from '../logger';
import { advanceEnrollment } from '../processors/sequence.processor';

const BATCH = 50;

export async function followupJob(): Promise<void> {
  const now = new Date();
  const due = await prisma.campaignEnrollment.findMany({
    where: {
      status: 'active',
      paused: false,
      OR: [{ nextSendAt: null }, { nextSendAt: { lte: now } }],
    },
    take: BATCH,
    select: { id: true },
  });
  if (due.length === 0) return;

  logger.info('followup: advancing enrollments', { count: due.length });

  for (const e of due) {
    try {
      await advanceEnrollment(e.id);
    } catch (err) {
      // One enrollment failing must not block the rest.
      logger.error('followup: failed to advance enrollment', {
        enrollmentId: e.id,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
