// Bootstrap the single platform_owner ("super duper admin") account. Creates a
// dedicated "Platform" company to hold it (every user needs a company) and the
// platform_owner user. Idempotent. Connects to whatever DATABASE_URL is in .env.
//
// Usage (bash):
//   PLATFORM_OWNER_EMAIL=muhammad.shaamel@gmail.com PLATFORM_OWNER_PASSWORD='<strong>' \
//   npx tsx scripts/create-platform-owner.ts
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
  const bcrypt = (await import('bcryptjs')).default;
  const { prisma } = await import('@outreach/db');

  const email = (process.env.PLATFORM_OWNER_EMAIL ?? 'muhammad.shaamel@gmail.com').trim().toLowerCase();
  const password = process.env.PLATFORM_OWNER_PASSWORD ?? '';
  if (!password || password.length < 8) {
    console.error('ERROR: set PLATFORM_OWNER_PASSWORD (>= 8 chars).');
    process.exit(1);
  }

  let company = await prisma.company.findFirst({ where: { name: 'Platform' }, select: { id: true } });
  if (!company) {
    company = await prisma.company.create({ data: { name: 'Platform', status: 'active' }, select: { id: true } });
    console.log('created "Platform" company');
  }

  const rounds = Number(process.env.BCRYPT_ROUNDS ?? 12);
  const passwordHash = await bcrypt.hash(password, rounds);
  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash, role: 'platform_owner', status: 'active' },
    create: {
      email,
      name: 'Platform Owner',
      passwordHash,
      role: 'platform_owner',
      status: 'active',
      companyId: company.id,
    },
    select: { email: true, role: true },
  });

  console.log(`✓ platform_owner ready: ${user.email} (role=${user.role})`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('create-platform-owner failed:', e);
  process.exit(1);
});
