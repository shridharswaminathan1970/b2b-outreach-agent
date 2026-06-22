// Removes the "E2E Live Test" pipeline-test artifacts (campaign + its sequence,
// enrollments, drafts, messages, deliverability events) and the sink contact.
// Dry-run by default; pass --apply to delete.
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import dotenv from 'dotenv';

(function loadEnv() {
  let dir = process.cwd();
  for (let i = 0; i < 6; i += 1) {
    const candidate = join(dir, '.env');
    if (existsSync(candidate)) return void dotenv.config({ path: candidate });
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  dotenv.config();
})();

async function main() {
  const apply = process.argv.includes('--apply');
  const { prisma } = await import('@outreach/db');

  const camp = await prisma.campaign.findFirst({ where: { name: 'E2E Live Test' }, select: { id: true } });
  const sinkContacts = await prisma.contact.findMany({
    where: { email: 'delivered@resend.dev' },
    select: { id: true },
  });
  console.log(`\nCampaign 'E2E Live Test': ${camp ? camp.id : 'none'} | sink contacts: ${sinkContacts.length}`);
  if (!camp && sinkContacts.length === 0) {
    await prisma.$disconnect();
    return;
  }

  const campId = camp?.id;
  const messages = campId
    ? await prisma.message.findMany({ where: { campaignId: campId }, select: { id: true } })
    : [];
  const seqs = campId
    ? await prisma.sequence.findMany({ where: { campaignId: campId }, select: { id: true } })
    : [];

  console.log('Would delete:', {
    messages: messages.length,
    deliverabilityEvents: '(for those messages)',
    drafts: campId ? await prisma.draft.count({ where: { campaignId: campId } }) : 0,
    enrollments: campId ? await prisma.campaignEnrollment.count({ where: { campaignId: campId } }) : 0,
    sequences: seqs.length,
    contacts: sinkContacts.length,
    campaign: campId ? 1 : 0,
  });

  if (!apply) {
    console.log('\nDRY RUN — re-run with --apply to delete.\n');
    await prisma.$disconnect();
    return;
  }

  await prisma.$transaction(async (tx) => {
    if (messages.length) {
      await tx.deliverabilityEvent.deleteMany({ where: { messageId: { in: messages.map((m) => m.id) } } });
    }
    if (campId) {
      await tx.message.deleteMany({ where: { campaignId: campId } });
      await tx.draft.deleteMany({ where: { campaignId: campId } });
      await tx.campaignEnrollment.deleteMany({ where: { campaignId: campId } });
      await tx.sequence.deleteMany({ where: { id: { in: seqs.map((s) => s.id) } } }); // steps cascade
    }
    if (sinkContacts.length) {
      const ids = sinkContacts.map((c) => c.id);
      await tx.message.deleteMany({ where: { contactId: { in: ids } } });
      await tx.draft.deleteMany({ where: { contactId: { in: ids } } });
      await tx.campaignEnrollment.deleteMany({ where: { contactId: { in: ids } } });
      await tx.contact.deleteMany({ where: { id: { in: ids } } });
    }
    if (campId) await tx.campaign.delete({ where: { id: campId } });
  });

  console.log('\nAPPLIED: E2E test artifacts removed.\n');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('cleanup failed:', e);
  process.exit(1);
});
