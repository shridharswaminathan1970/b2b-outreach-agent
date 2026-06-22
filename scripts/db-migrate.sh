#!/usr/bin/env bash
# Apply all pending Prisma migrations to the database. Idempotent — safe to run on
# every deploy (use as a Railway/Render release command). Prisma auto-loads .env
# (DATABASE_URL for runtime, DIRECT_URL for Migrate).
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> Applying database migrations…"
npx prisma migrate deploy --schema packages/db/prisma/schema.prisma
echo "==> Migrations applied."
