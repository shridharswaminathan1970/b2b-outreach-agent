// Removes the "Wizard Test Seq" sequence left over from sequence-wizard testing,
// plus its enrollments (and any drafts/messages that referenced its steps).
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

  const seqs = await prisma.sequence.findMany({
    where: { name: 'Wizard Test Seq' },
    select: { id: true, name: true, campaignId: true },
  });
  console.log(`\nFound ${seqs.length} "Wizard Test Seq" sequence(s).\n`);
  if (seqs.length === 0) {
    await prisma.$disconnect();
    return;
  }
  const seqIds = seqs.map((s) => s.id);
  const stepIds = (
    await prisma.sequenceStep.findMany({ where: { sequenceId: { in: seqIds } }, select: { id: true } })
  ).map((s) => s.id);

  const [enrollments, drafts, messages] = await Promise.all([
    prisma.campaignEnrollment.count({ where: { sequenceId: { in: seqIds } } }),
    prisma.draft.count({ where: { sequenceStepId: { in: stepIds } } }),
    prisma.message.count({ where: { sequenceStepId: { in: stepIds } } }),
  ]);
  console.log('Linked:', { steps: stepIds.length, enrollments, drafts, messages });

  if (!apply) {
    console.log('\nDRY RUN — re-run with --apply to delete.\n');
    await prisma.$disconnect();
    return;
  }

  await prisma.$transaction(async (tx) => {
    if (stepIds.length) {
      await tx.message.deleteMany({ where: { sequenceStepId: { in: stepIds } } });
      await tx.draft.deleteMany({ where: { sequenceStepId: { in: stepIds } } });
    }
    await tx.campaignEnrollment.deleteMany({ where: { sequenceId: { in: seqIds } } });
    await tx.sequence.deleteMany({ where: { id: { in: seqIds } } }); // steps cascade
  });
  console.log(`\nAPPLIED: removed ${seqs.length} sequence(s), ${enrollments} enrollment(s).\n`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('cleanup failed:', e);
  process.exit(1);
});
