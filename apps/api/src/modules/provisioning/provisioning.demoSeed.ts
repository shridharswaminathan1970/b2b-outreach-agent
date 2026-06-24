// Seeds a modest, representative demo dataset into a freshly-provisioned company
// so a new evaluation tenant has something to explore (accounts, contacts, a
// campaign + sequence). Everything is tagged with the new company's id/team/owner
// and marked source 'demo' so it can be cleaned out later.
import { prisma } from '../../config/database';

export async function seedDemoData(
  companyId: string,
  ownerUserId: string,
  teamId: string,
): Promise<void> {
  const acme = await prisma.account.create({
    data: {
      companyId,
      name: 'Acme Logistics (demo)',
      industry: 'Logistics',
      sizeBand: '51-200',
      country: 'United States',
    },
  });
  const nova = await prisma.account.create({
    data: {
      companyId,
      name: 'NovaStack (demo)',
      industry: 'Technology',
      sizeBand: '11-50',
      country: 'Singapore',
    },
  });

  const contacts = [
    { name: 'Dana Ortiz', firstName: 'Dana', lastName: 'Ortiz', email: 'dana@acme-demo.com', title: 'Head of Operations', accountId: acme.id },
    { name: 'Raj Patel', firstName: 'Raj', lastName: 'Patel', email: 'raj@acme-demo.com', title: 'VP Supply Chain', accountId: acme.id },
    { name: 'Mei Lin', firstName: 'Mei', lastName: 'Lin', email: 'mei@novastack-demo.io', title: 'Founder', accountId: nova.id },
    { name: 'Sam Cole', firstName: 'Sam', lastName: 'Cole', email: 'sam@novastack-demo.io', title: 'Operations Manager', accountId: nova.id },
  ];
  for (const c of contacts) {
    await prisma.contact.create({
      data: { companyId, teamId, ownerUserId, status: 'new', source: 'demo', ...c },
    });
  }

  const campaign = await prisma.campaign.create({
    data: {
      companyId,
      teamId,
      ownerUserId,
      createdBy: ownerUserId,
      name: 'Demo — 9-touch demand gen',
      objective: 'Sample campaign to explore the platform',
      persona: 'Operations leader',
      status: 'draft',
    },
  });

  const sequence = await prisma.sequence.create({
    data: { campaignId: campaign.id, name: 'Demo sequence', description: 'Sample 3-touch sequence', totalSteps: 3 },
  });
  await prisma.sequenceStep.createMany({
    data: [
      { sequenceId: sequence.id, stepOrder: 1, channel: 'email', delayHours: 0, intent: 'ops_intel', branding: 'signature_only', subject: 'A quick operational note' },
      { sequenceId: sequence.id, stepOrder: 2, channel: 'email', delayHours: 48, intent: 'ops_intel', branding: 'signature_only', subject: 'One more idea for your team' },
      { sequenceId: sequence.id, stepOrder: 3, channel: 'email', delayHours: 96, intent: 'ops_intel', branding: 'signature_only', subject: 'Worth a short look?' },
    ],
  });
}
