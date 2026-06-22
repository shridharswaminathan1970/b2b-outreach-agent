#!/usr/bin/env bash
# Build + start the full stack with production overrides, after applying DB
# migrations. Run from a host with Docker + a populated root .env (Supabase
# DATABASE_URL/DIRECT_URL, JWT secrets, ANTHROPIC_API_KEY, provider keys, etc.).
#
# For Railway / Render instead: deploy each service from its Dockerfile, set the
# same env vars in the dashboard, and use scripts/db-migrate.sh as the
# release/pre-deploy command.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "ERROR: .env not found at repo root. Copy .env.example and fill it in." >&2
  exit 1
fi

echo "==> Applying migrations…"
./scripts/db-migrate.sh

echo "==> Building + starting services (prod overrides)…"
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

echo "==> Deployed."
echo "    web    -> http://localhost (nginx, proxies /api)"
echo "    api    -> :3001 (internal)"
echo "    worker -> :3002 (internal, /health)"
