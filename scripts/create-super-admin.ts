// Bootstrap a single super_admin (and its company) — no demo data. Idempotent:
// re-running updates the password/role for an existing email. Connects to whatever
// DATABASE_URL is in the loaded .env (or the process env), so to target the live
// Railway DB run it locally with the production DATABASE_URL in .env.
//
// Usage (PowerShell):
//   $env:SUPERADMIN_EMAIL="you@orangekloud.com"; $env:SUPERADMIN_PASSWORD="<strong>"; `
//   $env:SUPERADMIN_NAME="Your Name"; $env:COMPANY_NAME="Orangekloud"; `
//   npx tsx scripts/create-super-admin.ts
//
// Usage (bash):
//   SUPERADMIN_EMAIL=you@orangekloud.com SUPERADMIN_PASSWORD='<strong>' \
//   SUPERADMIN_NAME='Your Name' COMPANY_NAME='Orangekloud' \
//   npx tsx scripts/create-super-admin.ts
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import dotenv from 'dotenv';

// Load the monorepo-root .env (for DATABASE_URL) the same way the app does.
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

  const email = (process.env.SUPERADMIN_EMAIL ?? '').trim().toLowerCase();
  const password = process.env.SUPERADMIN_PASSWORD ?? '';
  const name = (process.env.SUPERADMIN_NAME ?? 'Super Admin').trim();
  const companyName = (process.env.COMPANY_NAME ?? 'Orangekloud').trim();

  if (!email || !password) {
    console.error('ERROR: set SUPERADMIN_EMAIL and SUPERADMIN_PASSWORD (see header for usage).');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('ERROR: choose a password of at least 8 characters.');
    process.exit(1);
  }

  // Find-or-create the tenant company.
  let company = await prisma.company.findFirst({ where: { name: companyName }, select: { id: true } });
  if (!company) {
    company = await prisma.company.create({ data: { name: companyName, status: 'active' }, select: { id: true } });
    console.log(`created company "${companyName}"`);
  }

  const rounds = Number(process.env.BCRYPT_ROUNDS ?? 12);
  const passwordHash = await bcrypt.hash(password, rounds);

  // super_admin sits atop the company — no team, no manager.
  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash, role: 'super_admin', status: 'active', name },
    create: {
      email,
      name,
      passwordHash,
      role: 'super_admin',
      status: 'active',
      companyId: company.id,
    },
    select: { id: true, email: true, role: true },
  });

  console.log(`✓ super_admin ready: ${user.email} (role=${user.role}, company="${companyName}")`);
  console.log('  Log in at the web app with this email + the password you set.');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('create-super-admin failed:', e);
  process.exit(1);
});
