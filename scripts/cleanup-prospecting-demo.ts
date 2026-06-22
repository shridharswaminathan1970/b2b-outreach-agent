// Cleanup for demo contacts/accounts created by prospecting smoke tests.
// Dry-run by default (reports links + what would be deleted); pass --apply to
// actually delete. Deletes dependent rows first so nothing is orphaned.
//
//   npx tsx scripts/cleanup-prospecting-demo.ts          (dry run)
//   npx tsx scripts/cleanup-prospecting-demo.ts --apply  (delete)
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

  // The demo rows are exactly the prospecting-sourced contacts.
  const contacts = await prisma.contact.findMany({
    where: { source: 'prospecting' },
    select: { id: true, name: true, email: true, accountId: true, externalId: true },
  });

  console.log(`\nFound ${contacts.length} prospecting-sourced contact(s).\n`);
  if (contacts.length === 0) {
    await prisma.$disconnect();
    return;
  }

  const contactIds = contacts.map((c) => c.id);

  // Check every relation that could orphan if we hard-deleted the contact.
  const [enrollments, drafts, messages, replies, tasks, enrichmentJobs, opportunities] =
    await Promise.all([
      prisma.campaignEnrollment.findMany({ where: { contactId: { in: contactIds } }, select: { id: true } }),
      prisma.draft.findMany({ where: { contactId: { in: contactIds } }, select: { id: true } }),
      prisma.message.findMany({ where: { contactId: { in: contactIds } }, select: { id: true } }),
      prisma.reply.findMany({ where: { contactId: { in: contactIds } }, select: { id: true } }),
      prisma.task.findMany({ where: { contactId: { in: contactIds } }, select: { id: true } }),
      prisma.enrichmentJob.findMany({ where: { contactId: { in: contactIds } }, select: { id: true } }),
      prisma.opportunity.findMany({ where: { contactId: { in: contactIds } }, select: { id: true } }),
    ]);

  console.log('Linked rows that would block / orphan a raw delete:');
  console.log('  enrollments   :', enrollments.length);
  console.log('  drafts        :', drafts.length);
  console.log('  messages      :', messages.length);
  console.log('  replies       :', replies.length);
  console.log('  tasks         :', tasks.length);
  console.log('  enrichmentJobs:', enrichmentJobs.length);
  console.log('  opportunities :', opportunities.length);

  // Accounts that would be left with zero contacts once these are gone.
  const accountIds = [...new Set(contacts.map((c) => c.accountId).filter((a): a is string => Boolean(a)))];
  const orphanAccounts: string[] = [];
  for (const accId of accountIds) {
    const remaining = await prisma.contact.count({
      where: { accountId: accId, id: { notIn: contactIds } },
    });
    if (remaining === 0) orphanAccounts.push(accId);
  }
  console.log(`\nAccounts referenced: ${accountIds.length}; would become empty: ${orphanAccounts.length}`);

  if (!apply) {
    console.log('\nDRY RUN — re-run with --apply to delete. Plan:');
    console.log(`  delete ${enrollments.length} enrollment(s), ${drafts.length} draft(s), ${messages.length} message(s), ${replies.length} reply(ies), ${tasks.length} task(s), ${enrichmentJobs.length} enrichment job(s)`);
    console.log(`  null opportunity.contactId on ${opportunities.length} opportunity(ies)`);
    console.log(`  delete ${contacts.length} contact(s) and ${orphanAccounts.length} now-empty account(s)`);
    await prisma.$disconnect();
    return;
  }

  // Apply — delete dependents first, then contacts, then empty accounts. Wrapped
  // in a transaction so a failure leaves nothing half-deleted.
  await prisma.$transaction(async (tx) => {
    await tx.reply.deleteMany({ where: { contactId: { in: contactIds } } });
    await tx.message.deleteMany({ where: { contactId: { in: contactIds } } });
    await tx.draft.deleteMany({ where: { contactId: { in: contactIds } } });
    await tx.campaignEnrollment.deleteMany({ where: { contactId: { in: contactIds } } });
    await tx.task.deleteMany({ where: { contactId: { in: contactIds } } });
    await tx.enrichmentJob.deleteMany({ where: { contactId: { in: contactIds } } });
    // Opportunities are real pipeline records — keep them but unlink the contact.
    await tx.opportunity.updateMany({ where: { contactId: { in: contactIds } }, data: { contactId: null } });
    await tx.contact.deleteMany({ where: { id: { in: contactIds } } });
    if (orphanAccounts.length) {
      await tx.account.deleteMany({ where: { id: { in: orphanAccounts } } });
    }
  });

  console.log(`\nAPPLIED: deleted ${contacts.length} contact(s) + ${orphanAccounts.length} empty account(s), with all dependent rows.\n`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('cleanup failed:', e);
  process.exit(1);
});
