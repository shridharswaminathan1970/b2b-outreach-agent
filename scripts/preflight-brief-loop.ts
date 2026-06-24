// Pre-flight: exercise the Campaign Brief → live AI draft loop end-to-end.
//
// What it does (against your real DB, using the seeded super_admin as actor):
//   1. Creates a brief-driven campaign (Campaign + CampaignBrief + Sequence)
//   2. Creates a throwaway Account + Contact
//   3. Runs the REAL generation job (live Claude if ANTHROPIC_API_KEY is set)
//      for one trust touch and one CTA touch
//   4. Prints the generated drafts (subject + body + quality score)
//   5. Cleans everything up  (pass --keep to leave it in the DB for Prisma Studio)
//
// Run:  npx tsx scripts/preflight-brief-loop.ts
//       npx tsx scripts/preflight-brief-loop.ts --keep
import 'dotenv/config';
import { prisma } from '../apps/api/src/config/database';
import * as brief from '../apps/api/src/modules/campaigns/brief.service';
import type { Actor } from '../apps/api/src/utils/tenancy';
import { generationJob } from '../apps/worker/src/jobs/generation.job';
import { isLiveMode } from '@outreach/ai';

const KEEP = process.argv.includes('--keep');

async function main() {
  console.log(`\n=== Brief loop pre-flight ===  (AI live mode: ${isLiveMode()})\n`);

  const admin = await prisma.user.findFirst({
    where: { role: 'super_admin' },
    select: { id: true, role: true, companyId: true, teamId: true },
  });
  if (!admin) throw new Error('No super_admin user found to act as.');
  const actor: Actor = {
    id: admin.id, role: admin.role as Actor['role'],
    companyId: admin.companyId, teamId: admin.teamId, ipAddress: null,
  };

  // 1. Brief-driven campaign.
  console.log('1/4  Creating brief-driven campaign…');
  const created = await brief.createCampaignFromBrief(
    {
      name: 'PREFLIGHT — Brief Loop',
      objective: 'Validate live draft generation',
      productBrief: {
        productName: 'FlowOps',
        productPurpose: 'Automates operational handoffs so nothing falls through the cracks between teams.',
        targetCustomer: 'Ops leaders at 50–200 person logistics firms',
        u1Unworkable: 'Handoffs live in spreadsheets and email; tasks get dropped between shifts.',
        u2Urgent: 'Peak season is weeks away and volume is spiking.',
        u3Unavoidable: 'Every dropped handoff is a missed SLA and a churned customer.',
        u4Underserved: 'Generic project tools do not model operational handoffs.',
        positioningStatement: 'The system of record for operational handoffs.',
      },
      buyerPersona: {
        industry: 'Logistics', companySize: '50–200',
        economicBuyerSeniority: 'VP', economicBuyerDesignation: 'VP Operations',
      },
      strategy: {
        totalTouchpoints: 9,
        trustRatio: 0.8,
        ctaTouches: [
          { ctaType: 'webinar', config: { webinar_title: 'Peak Season Handoff Playbook', registration_link: 'https://example.co/webinar' } },
          { ctaType: 'demo', config: { meeting_type: 'Product demo', duration: '30 min', booking_link: 'https://example.co/book' } },
        ],
      },
    },
    actor,
  );
  const campaignId = created.campaign.id;
  const steps = created.sequence?.steps ?? [];
  const trustStep = steps.find((s) => s.touchType !== 'cta')!;
  const ctaStep = steps.find((s) => s.touchType === 'cta')!;
  console.log(`     campaign ${campaignId} — ${steps.length} steps (trust + CTA)`);

  // 2. Throwaway account + contact.
  console.log('2/4  Creating throwaway contact…');
  const account = await prisma.account.create({
    data: { companyId: actor.companyId, name: 'Acme Logistics (preflight)' },
  });
  const contact = await prisma.contact.create({
    data: {
      companyId: actor.companyId,
      teamId: actor.teamId,
      accountId: account.id,
      name: 'Dana Ortiz',
      title: 'VP Operations',
      email: `preflight+${Date.now()}@example.com`,
      metadataJson: { painPoints: 'Dropped handoffs between shifts during peak season' },
    },
  });

  // 3. Run the real generation job for a trust + a CTA touch.
  console.log('3/4  Generating drafts (this calls Claude if live)…');
  await generationJob({ contactId: contact.id, campaignId, sequenceStepId: trustStep.id });
  await generationJob({ contactId: contact.id, campaignId, sequenceStepId: ctaStep.id });

  // 4. Show the drafts.
  const drafts = await prisma.draft.findMany({
    where: { contactId: contact.id, campaignId },
    orderBy: { createdAt: 'asc' },
  });
  console.log(`4/4  ${drafts.length} draft(s) generated:\n`);
  for (const d of drafts) {
    const stepType = d.sequenceStepId === ctaStep.id ? 'CTA (webinar)' : `trust (${trustStep.touchType})`;
    console.log('────────────────────────────────────────────────────────');
    console.log(`TOUCH: ${stepType}   quality=${d.qualityScore ?? 'n/a'}  status=${d.status}`);
    console.log(`SUBJECT: ${d.subject}`);
    console.log('');
    console.log(d.body);
    console.log('');
  }
  console.log('────────────────────────────────────────────────────────');

  if (KEEP) {
    console.log(`\nKept in DB. Campaign "${created.campaign.name}" (${campaignId}). Drafts are in the review queue.`);
    console.log('Re-run with no flag (or clean manually) to remove.');
  } else {
    console.log('\nCleaning up…');
    await prisma.draft.deleteMany({ where: { campaignId } });
    await prisma.contact.delete({ where: { id: contact.id } });
    await prisma.account.delete({ where: { id: account.id } });
    await prisma.sequenceStep.deleteMany({ where: { sequence: { campaignId } } });
    await prisma.sequence.deleteMany({ where: { campaignId } });
    await prisma.campaignBrief.deleteMany({ where: { campaignId } });
    await prisma.auditLog.deleteMany({ where: { entityType: 'campaign', entityId: campaignId } });
    await prisma.campaign.delete({ where: { id: campaignId } });
    console.log('  done.');
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('\nPRE-FLIGHT FAILED:', e);
  await prisma.$disconnect();
  process.exit(1);
});
