#!/usr/bin/env bash
# Seed baseline data (Default Company + Team, admin user, global prompt defaults,
# templates, sample contacts). Idempotent — guarded with upserts/find-first. The
# seed loads .env via `import 'dotenv/config'`.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> Seeding database…"
npx tsx packages/db/prisma/seed.ts
echo "==> Seed complete."
