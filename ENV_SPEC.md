# ENV_SPEC.md
# Every environment variable used across the entire system.
# Create .env.example at the repo root with ALL of these variables.
# Create .env (gitignored) and fill in real values before running.
#
# VARIABLE FORMAT:
# VAR_NAME=example_value          # TYPE | REQUIRED | Description
#
# TYPES: string | number | boolean | url | secret | enum
# REQUIRED: required | optional
# ──────────────────────────────────────────────────────────────────────────────

## ══════════════════════════════════════════════════════
## DATABASE
## ══════════════════════════════════════════════════════

# PostgreSQL connection string
# Format: postgresql://USER:PASSWORD@HOST:PORT/DATABASE
# For Docker local dev: postgresql://outreach:outreach_dev_password@localhost:5432/outreach_db
DATABASE_URL=postgresql://outreach:outreach_dev_password@localhost:5432/outreach_db
# TYPE: url | REQUIRED
# Used by: packages/db (Prisma), apps/api, apps/worker
# Notes: Use connection pooling URL (e.g. Supabase pooler) in production

DATABASE_POOL_MIN=2
# TYPE: number | OPTIONAL | Default: 2
# Minimum Prisma connection pool size

DATABASE_POOL_MAX=10
# TYPE: number | OPTIONAL | Default: 10
# Maximum Prisma connection pool size


## ══════════════════════════════════════════════════════
## JOB QUEUE — pg-boss (NO REDIS)
## ══════════════════════════════════════════════════════
# DEPRECATED: this stack does NOT use Redis/BullMQ. The worker queue runs on the
# same Supabase Postgres via pg-boss, which creates its own `pgboss` schema and
# uses the SESSION connection (DIRECT_URL above — the transaction pooler is
# incompatible with pg-boss). No REDIS_URL / REDIS_PASSWORD / BULL_QUEUE_PREFIX
# variables are read by any service. See the WORKER section below for the queue
# concurrency + cron settings.


## ══════════════════════════════════════════════════════
## API SERVICE
## ══════════════════════════════════════════════════════

NODE_ENV=development
# TYPE: enum | REQUIRED | Values: development | test | production
# Used by: all services

API_PORT=3001
# TYPE: number | OPTIONAL | Default: 3001
# Port the Express API server listens on

API_BASE_URL=http://localhost:3001
# TYPE: url | REQUIRED
# Public base URL of the API — used in email links and CRM webhook callbacks

CORS_ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
# TYPE: string | REQUIRED
# Comma-separated list of allowed CORS origins
# Production example: https://app.yourcompany.com


## ══════════════════════════════════════════════════════
## AUTHENTICATION & SECURITY
## ══════════════════════════════════════════════════════

JWT_SECRET=change_this_to_a_random_64_char_secret_before_production
# TYPE: secret | REQUIRED
# Used to sign JWT access tokens
# Generate with: openssl rand -hex 32
# NEVER use the default value in production

JWT_REFRESH_SECRET=change_this_to_a_different_random_64_char_secret
# TYPE: secret | REQUIRED
# Used to sign JWT refresh tokens — must be different from JWT_SECRET

JWT_ACCESS_EXPIRES_IN=15m
# TYPE: string | OPTIONAL | Default: 15m
# Access token expiry. Format: https://github.com/vercel/ms

JWT_REFRESH_EXPIRES_IN=7d
# TYPE: string | OPTIONAL | Default: 7d
# Refresh token expiry

BCRYPT_ROUNDS=12
# TYPE: number | OPTIONAL | Default: 12
# bcryptjs hash rounds. 12 is secure. Lower for test speed (4–8).

RATE_LIMIT_WINDOW_MS=900000
# TYPE: number | OPTIONAL | Default: 900000 (15 minutes)
# Rate limit window in milliseconds

RATE_LIMIT_MAX_REQUESTS=100
# TYPE: number | OPTIONAL | Default: 100
# Max requests per IP per window


## ══════════════════════════════════════════════════════
## ANTHROPIC / CLAUDE AI
## ══════════════════════════════════════════════════════

ANTHROPIC_API_KEY=sk-ant-api03-your-key-here
# TYPE: secret | REQUIRED
# Get from: https://console.anthropic.com/api-keys
# Used by: packages/ai — ALL Claude API calls go through this key

ANTHROPIC_MODEL_DRAFT=claude-sonnet-4-6
# TYPE: string | OPTIONAL | Default: claude-sonnet-4-6
# Model used for email draft generation
# Options: claude-opus-4-6 (higher quality), claude-sonnet-4-6 (balanced), claude-haiku-4-5-20251001 (fast)

ANTHROPIC_MODEL_CLASSIFY=claude-haiku-4-5-20251001
# TYPE: string | OPTIONAL | Default: claude-haiku-4-5-20251001
# Model used for reply classification (fast + cheap is sufficient)

ANTHROPIC_MODEL_RESEARCH=claude-sonnet-4-6
# TYPE: string | OPTIONAL | Default: claude-sonnet-4-6
# Model used for research brief generation

ANTHROPIC_MAX_TOKENS_DRAFT=1500
# TYPE: number | OPTIONAL | Default: 1500
# Max tokens for draft generation responses

ANTHROPIC_MAX_TOKENS_CLASSIFY=300
# TYPE: number | OPTIONAL | Default: 300
# Max tokens for reply classification responses

ANTHROPIC_RETRY_ATTEMPTS=3
# TYPE: number | OPTIONAL | Default: 3
# Number of retry attempts on rate limit or server errors

ANTHROPIC_RETRY_BASE_DELAY_MS=1000
# TYPE: number | OPTIONAL | Default: 1000
# Base delay in ms for exponential backoff on retries

CLASSIFY_CONFIDENCE_THRESHOLD=0.70
# TYPE: number | OPTIONAL | Default: 0.70
# Replies classified below this confidence score are flagged needs_human_review=true


## ══════════════════════════════════════════════════════
## EMAIL DELIVERY — RESEND
## ══════════════════════════════════════════════════════

RESEND_API_KEY=re_your_resend_api_key_here
# TYPE: secret | REQUIRED (unless USE_MOCK_EMAIL=true)
# Get from: https://resend.com/api-keys
# Used by: packages/integrations/email/resend.adapter.ts

EMAIL_FROM_ADDRESS=outreach@yourdomain.com
# TYPE: string | REQUIRED
# The "From" address for all outbound emails
# Must be a verified domain in Resend

EMAIL_FROM_NAME=Muhammad Shaamel
# TYPE: string | OPTIONAL | Default: Outreach Agent
# Display name in the "From" field

EMAIL_REPLY_TO=shaamel@orangekloud.com
# TYPE: string | OPTIONAL
# Reply-to address. If empty, replies go to EMAIL_FROM_ADDRESS

EMAIL_DAILY_SEND_LIMIT=500
# TYPE: number | OPTIONAL | Default: 500
# Maximum emails sent per day across all campaigns (safety cap)

EMAIL_RATE_LIMIT_PER_HOUR=100
# TYPE: number | OPTIONAL | Default: 100
# Maximum emails per hour (respects Resend rate limits)

USE_MOCK_EMAIL=false
# TYPE: boolean | OPTIONAL | Default: false
# Set to true to use mock email adapter (logs sends, never actually sends)
# Always true in test environment


## ══════════════════════════════════════════════════════
## ENRICHMENT — APOLLO.IO
## ══════════════════════════════════════════════════════

APOLLO_API_KEY=your_apollo_api_key_here
# TYPE: secret | REQUIRED (unless USE_MOCK_ENRICHMENT=true)
# Get from: https://app.apollo.io/#/settings/integrations/api
# Used by: packages/integrations/enrichment/apollo.adapter.ts

APOLLO_API_BASE_URL=https://api.apollo.io/api/v1
# TYPE: url | OPTIONAL | Default: https://api.apollo.io/api/v1
# Apollo API base URL

ENRICHMENT_RATE_LIMIT_PER_MINUTE=20
# TYPE: number | OPTIONAL | Default: 20
# Apollo free tier: 50 requests/min. Paid: higher. Set conservatively.

USE_MOCK_ENRICHMENT=false
# TYPE: boolean | OPTIONAL | Default: false
# Set to true to use mock enrichment (returns fabricated data for testing)
# Always true in test environment


## ══════════════════════════════════════════════════════
## CRM — HUBSPOT
## ══════════════════════════════════════════════════════

HUBSPOT_ACCESS_TOKEN=pat-na1-your-hubspot-access-token
# TYPE: secret | REQUIRED (unless USE_MOCK_CRM=true)
# Get from: HubSpot → Settings → Integrations → Private Apps → Create
# Required scopes: crm.contacts.write, crm.contacts.read, crm.objects.notes.write

HUBSPOT_PORTAL_ID=your_portal_id
# TYPE: string | OPTIONAL
# HubSpot portal/account ID — used in activity URLs

CRM_SYNC_ENABLED=true
# TYPE: boolean | OPTIONAL | Default: true
# Set to false to disable all CRM sync (useful in staging)

USE_MOCK_CRM=false
# TYPE: boolean | OPTIONAL | Default: false
# Set to true to use mock CRM adapter (logs operations, never calls HubSpot)
# Always true in test environment


## ══════════════════════════════════════════════════════
## FRONTEND (Web App)
## ══════════════════════════════════════════════════════
# Note: Vite requires all frontend env vars to be prefixed with VITE_

VITE_API_BASE_URL=http://localhost:3001
# TYPE: url | REQUIRED
# Must match API_BASE_URL — used by React frontend for all API calls

VITE_APP_NAME=Outreach Agent
# TYPE: string | OPTIONAL | Default: Outreach Agent
# Display name shown in browser tab and sidebar

VITE_APP_ENV=development
# TYPE: enum | OPTIONAL | Values: development | staging | production
# Controls which features are enabled in the frontend


## ══════════════════════════════════════════════════════
## LOGGING
## ══════════════════════════════════════════════════════

LOG_LEVEL=info
# TYPE: enum | OPTIONAL | Default: info
# Values: error | warn | info | debug
# Use debug in development, info in production

LOG_FORMAT=pretty
# TYPE: enum | OPTIONAL | Default: pretty
# Values: pretty (human-readable) | json (structured, for log aggregators)
# Use json in production (e.g. for Datadog, Papertrail, Logtail)


## ══════════════════════════════════════════════════════
## WORKER / JOB QUEUE SETTINGS
## ══════════════════════════════════════════════════════

WORKER_CONCURRENCY_ENRICHMENT=5
# TYPE: number | OPTIONAL | Default: 5
# How many enrichment jobs run in parallel

WORKER_CONCURRENCY_GENERATION=3
# TYPE: number | OPTIONAL | Default: 3
# How many draft generation jobs run in parallel (AI rate limit aware)

WORKER_CONCURRENCY_SENDING=10
# TYPE: number | OPTIONAL | Default: 10
# How many send jobs run in parallel

WORKER_CONCURRENCY_REPLY_CHECK=5
# TYPE: number | OPTIONAL | Default: 5
# How many reply check jobs run in parallel

WORKER_PORT=3002
# TYPE: number | OPTIONAL | Default: 3002
# Port for the worker's GET /health server

REPLY_CHECK_CRON=*/5 * * * *
# TYPE: string | OPTIONAL | Default: */5 * * * *
# Cron cadence (node-cron) for the reply-check polling job

FOLLOWUP_CRON=*/10 * * * *
# TYPE: string | OPTIONAL | Default: */10 * * * *
# Cron cadence (node-cron) for the follow-up / sequence-advance polling job

WORKER_AUTO_CREATE_OPPORTUNITY=true
# TYPE: boolean | OPTIONAL | Default: true
# Auto-create an Opportunity when the reply-check worker classifies a reply as
# "interested" (the worker-side conversion). pg-boss retry/backoff is configured
# per-enqueue in code (retryLimit 3, retryDelay 30s, exponential).


## ══════════════════════════════════════════════════════
## SUPPRESSION & COMPLIANCE
## ══════════════════════════════════════════════════════

HARD_BOUNCE_AUTO_SUPPRESS=true
# TYPE: boolean | OPTIONAL | Default: true
# Automatically add email to suppression list on first hard bounce

UNSUBSCRIBE_REDIRECT_URL=https://yourcompany.com/unsubscribed
# TYPE: url | OPTIONAL
# URL shown to users after they click unsubscribe
# If empty, shows a plain text confirmation

UNSUBSCRIBE_SECRET=change_this_to_random_secret_for_unsubscribe_links
# TYPE: secret | REQUIRED
# Used to sign unsubscribe tokens in email footers
# Generate with: openssl rand -hex 32

MAX_DAILY_SENDS_PER_CONTACT=1
# TYPE: number | OPTIONAL | Default: 1
# Maximum emails sent to a single contact per day

GLOBAL_SUPPRESSION_CHECK_ENABLED=true
# TYPE: boolean | OPTIONAL | Default: true
# When true, suppression is checked synchronously before every send


## ══════════════════════════════════════════════════════
## FEATURE FLAGS
## ══════════════════════════════════════════════════════

FEATURE_DRAFT_AUTO_APPROVE=false
# TYPE: boolean | OPTIONAL | Default: false
# When false (recommended), all AI drafts require human approval before sending
# Set to true ONLY in trusted automation environments

FEATURE_MULTI_CHANNEL=false
# TYPE: boolean | OPTIONAL | Default: false
# Enables LinkedIn/SMS channel support (Phase 2 feature)

FEATURE_AB_TESTING=false
# TYPE: boolean | OPTIONAL | Default: false
# Enables A/B testing of subject lines and CTAs (Phase 2 feature)

FEATURE_MEETING_BOOKING=false
# TYPE: boolean | OPTIONAL | Default: false
# Enables calendar integration for meeting booking on positive reply (Phase 2)


## ══════════════════════════════════════════════════════
## SEED DATA (used by packages/db/prisma/seed.ts)
## ══════════════════════════════════════════════════════

SEED_ADMIN_EMAIL=admin@yourcompany.com
# TYPE: string | OPTIONAL | Default: admin@example.com
# Email for the seeded admin user

SEED_ADMIN_PASSWORD=Admin@SecurePassword123
# TYPE: secret | OPTIONAL
# Password for the seeded admin user — change immediately after first login

SEED_ADMIN_NAME=Muhammad Shaamel
# TYPE: string | OPTIONAL
# Display name for the seeded admin user


## ══════════════════════════════════════════════════════
## PRODUCTION-ONLY VARIABLES (not needed in local dev)
## ══════════════════════════════════════════════════════

# DATABASE_URL_PROD=postgresql://user:pass@host:5432/db?sslmode=require
# Separate production DB URL with SSL

# S3_BUCKET_NAME=outreach-backups
# For pg_dump backup uploads

# S3_ACCESS_KEY_ID=your_access_key
# S3_SECRET_ACCESS_KEY=your_secret
# S3_REGION=ap-southeast-1

# SENTRY_DSN=https://your-sentry-dsn
# For error tracking in production

# LOGTAIL_TOKEN=your_logtail_source_token
# For structured log aggregation in production
