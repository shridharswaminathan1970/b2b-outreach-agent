// One-off smoke test for the Campaign Brief system. Exercises the real service
// layer + DB round-trip and the AI draft generator (mock mode), then cleans up.
// Run: npx tsx scripts/smoke-campaign-brief.ts
import { prisma } from '../apps/api/src/config/database';
import * as brief from '../apps/api/src/modules/campaigns/brief.service';
import type { Actor } from '../apps/api/src/utils/tenancy';
import { generateDraft } from '@outreach/ai';

async function main() {
  const admin = await prisma.user.findFirst({
    where: { role: 'super_admin' },
    select: { id: true, role: true, companyId: true, teamId: true },
  });
  if (!admin) throw new Error('No super_admin user found to act as.');
  const actor: Actor = {
    id: admin.id,
    role: admin.role as Actor['role'],
    companyId: admin.companyId,
    teamId: admin.teamId,
    ipAddress: null,
  };

  console.log('Creating campaign from brief…');
  const created = await brief.createCampaignFromBrief(
    {
      name: 'SMOKE — Brief Test',
      objective: 'Validate the brief flow',
      productBrief: {
        productName: 'FlowOps',
        productPurpose: 'Automates ops handoffs so nothing falls through the cracks.',
        targetCustomer: 'Ops leaders at 50–200 person logistics firms',
        u1Unworkable: 'Handoffs live in spreadsheets and email; things get dropped.',
        u2Urgent: 'Peak season is weeks away and volume is spiking.',
        u3Unavoidable: 'Every dropped handoff is a missed SLA and a churned customer.',
        u4Underserved: 'Generic PM tools do not model operational handoffs.',
        positioningStatement: 'The system of record for operational handoffs.',
      },
      buyerPersona: {
        industry: 'Logistics',
        companySize: '50–200',
        economicBuyerSeniority: 'VP',
        economicBuyerDesignation: 'VP Operations',
      },
      strategy: {
        totalTouchpoints: 9,
        trustRatio: 0.8,
        ctaTouches: [
          { ctaType: 'webinar', config: { webinar_title: 'Peak Season Playbook', registration_link: 'https://ex.co/w' } },
          { ctaType: 'demo', config: { duration: '30 min', booking_link: 'https://cal.co/x' } },
        ],
      },
    },
    actor,
  );

  const campaignId = created.campaign.id;
  const steps = created.sequence?.steps ?? [];
  const trust = steps.filter((s) => s.touchType !== 'cta');
  const cta = steps.filter((s) => s.touchType === 'cta');
  console.log(`  campaign ${campaignId}`);
  console.log(`  steps: ${steps.length} (trust ${trust.length}, cta ${cta.length})`);
  console.log('  trust types:', trust.map((s) => s.touchType).join(', '));
  console.log('  cta types:', cta.map((s) => `${s.ctaType ?? 'none'}`).join(', '));

  // Assertions.
  const ok =
    steps.length === 9 &&
    trust.length === 7 &&
    cta.length === 2 &&
    cta[0].ctaType === 'webinar' &&
    cta[1].ctaType === 'demo' &&
    cta[0].intent === 'soft_positioning' &&
    trust[0].intent === 'ops_intel';
  console.log(ok ? '  ✓ sequence plan correct' : '  ✗ sequence plan WRONG');

  // AI draft for the first CTA touch (mock mode → should mention the webinar).
  const draft = await generateDraft({
    contactName: 'Dana Ortiz',
    company: 'Acme Logistics',
    title: 'VP Operations',
    touchType: 'cta',
    cta: { type: 'webinar', config: { webinar_title: 'Peak Season Playbook', registration_link: 'https://ex.co/w' } },
    brief: { positioningStatement: 'The system of record for operational handoffs.' },
  });
  if (draft.ok) {
    const mentions = /peak season playbook/i.test(draft.body);
    console.log(`  CTA draft subject: ${draft.subject}`);
    console.log(mentions ? '  ✓ CTA draft references the webinar' : '  ✗ CTA draft missing webinar');
  } else {
    console.log('  ✗ draft generation failed:', draft.error.message);
  }

  // Cleanup (cascades to brief + sequence steps; delete enrollments/sequences first).
  console.log('Cleaning up…');
  await prisma.sequenceStep.deleteMany({ where: { sequence: { campaignId } } });
  await prisma.sequence.deleteMany({ where: { campaignId } });
  await prisma.campaignBrief.deleteMany({ where: { campaignId } });
  await prisma.auditLog.deleteMany({ where: { entityType: 'campaign', entityId: campaignId } });
  await prisma.campaign.delete({ where: { id: campaignId } });
  console.log('  done.');

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
