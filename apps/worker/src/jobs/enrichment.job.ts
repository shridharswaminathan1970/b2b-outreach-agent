// Enrichment job: calls the enrichment adapter (Apollo, or mock), updates the
// contact record, and logs the result. Idempotent — re-running simply refreshes
// the enrichment. On failure the contact is left unmarked and the job rethrows
// so pg-boss retries.
import { prisma } from '@outreach/db';
import { getEnrichmentAdapter } from '@outreach/integrations';
import { logger } from '../logger';
import { writeAudit, auditJobStart } from '../audit';
import { enqueue, QUEUES, type JobPayloads } from '../config/queues';

export async function enrichmentJob(data: JobPayloads['enrichment']): Promise<void> {
  const { contactId } = data;
  const end = await auditJobStart('contact', contactId, 'enrichment');

  try {
    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
      include: { account: { select: { id: true, name: true, domain: true } } },
    });
    if (!contact) {
      logger.warn('enrichment: contact not found', { contactId });
      await end();
      return;
    }

    const adapter = getEnrichmentAdapter();
    const result = await adapter.enrich({
      email: contact.email,
      firstName: contact.firstName,
      lastName: contact.lastName,
      company: contact.account?.name,
      domain: contact.account?.domain,
      linkedinUrl: contact.linkedinUrl,
    });

    // Validate the email too (non-fatal).
    const validation = contact.email ? await adapter.validate(contact.email) : null;

    // Merge enrichment without clobbering existing non-null fields with nulls.
    await prisma.contact.update({
      where: { id: contactId },
      data: {
        // Unlock the email when the provider revealed one and we had none.
        email: contact.email ?? result.email ?? undefined,
        title: contact.title ?? result.title ?? undefined,
        seniority: contact.seniority ?? result.seniority ?? undefined,
        department: contact.department ?? result.department ?? undefined,
        phone: contact.phone ?? result.phone ?? undefined,
        linkedinUrl: contact.linkedinUrl ?? result.linkedinUrl ?? undefined,
        location: contact.location ?? result.location ?? undefined,
        enriched: result.found,
        emailVerified: validation?.deliverable ?? contact.emailVerified,
        validated: validation ? validation.valid : contact.validated,
      },
    });

    // Backfill account firmographics (size band drives ICP scoring).
    if (contact.account && (result.companySize || result.industry)) {
      await prisma.account.update({
        where: { id: contact.account.id },
        data: {
          sizeBand: result.companySize ?? undefined,
          industry: result.industry ?? undefined,
          domain: contact.account.domain ?? result.companyDomain ?? undefined,
        },
      });
    }

    await writeAudit({
      entityType: 'contact',
      entityId: contactId,
      action: 'contact.enriched',
      summary: `Enriched via ${result.provider} (found=${result.found})`,
      payload: {
        provider: result.provider,
        found: result.found,
        emailDeliverable: validation?.deliverable ?? null,
      },
    });

    // Chain to scoring now that firmographics are populated.
    await enqueue(QUEUES.scoring, { contactId });

    await end();
  } catch (err) {
    logger.error('enrichment job failed', {
      contactId,
      message: err instanceof Error ? err.message : String(err),
    });
    await writeAudit({
      entityType: 'contact',
      entityId: contactId,
      action: 'contact.enrich_failed',
      summary: 'Enrichment failed',
    });
    throw err; // let pg-boss retry
  }
}
