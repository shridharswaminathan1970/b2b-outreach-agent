# Outreach Agent

AI-powered B2B sales and marketing outreach system for Orangekloud Technology Inc.

Imports and enriches leads, scores them by ICP fit, generates personalized outreach
sequences with Claude AI, sends them through an approved email provider, classifies
inbound replies, suppresses opt-outs immediately, and syncs every action back to the CRM
with a full audit trail.

## Tech stack

- **Backend API**: Node.js + Express + TypeScript (`apps/api`)
- **Worker service**: Node.js + BullMQ + Redis (`apps/worker`)
- **AI layer**: Anthropic Claude API (`packages/ai`)
- **Database**: PostgreSQL + Prisma ORM (`packages/db`)
- **Frontend**: React + Vite + TypeScript + Tailwind CSS (`apps/web`)
- **Integrations**: Resend (email), Apollo.io (enrichment), HubSpot (CRM) (`packages/integrations`)

## Monorepo layout

```
apps/        api, worker, web services
packages/    db, ai, integrations, shared libraries
docs/        architecture, API spec, prompt library, runbook
scripts/     deploy and migration scripts
tests/       cross-service integration and e2e tests
```

See `CLAUDE.md`, `FOLDER_STRUCTURE.md`, `PACKAGE_SPECS.md`, `ENV_SPEC.md`, and `SCHEMA.sql`
for the full build specification.

## Quick start (local development)

1. Copy `.env.example` to `.env` and fill in real values (or leave `USE_MOCK_*` flags on).
2. Install dependencies:
   ```
   npm install
   ```
3. Start Postgres + Redis (via Docker, or point `DATABASE_URL`/`REDIS_URL` at existing instances):
   ```
   docker compose up -d postgres redis
   ```
4. Run database migrations and seed data:
   ```
   npm run db:migrate
   npm run db:seed
   ```
5. Start all services in dev mode:
   ```
   npm run dev
   ```
6. API: http://localhost:3001 · Web: http://localhost:5173 (Vite dev) or :3000 (Docker) · Prisma Studio: `npm run db:studio`

## Build status

This project is being built in phases per `CLAUDE.md`. See that file for the full build order
and the Definition of Done checklist.
