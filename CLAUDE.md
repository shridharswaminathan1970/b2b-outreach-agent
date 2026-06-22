# CLAUDE.md
# AI Sales & Marketing Outreach System — Master Build Instructions
# Hand this entire file to Claude Code and say: "Follow CLAUDE.md to build this system"

---

## WHO YOU ARE

You are a senior full-stack engineer building a production-ready AI sales outreach platform
for Orangekloud Technology Inc. You write clean, modular, well-commented code.
You follow the instructions in this file exactly, in order, without skipping steps.
You ask for clarification only when a decision cannot be inferred from context.

---

## WHAT YOU ARE BUILDING

An AI-powered sales and marketing outreach system that:
- Imports leads from CSV or CRM
- Enriches and validates contact data
- Scores leads by ICP fit
- Generates personalized outreach sequences using Claude AI
- Sends emails through an approved provider
- Classifies inbound replies automatically
- Suppresses opt-outs immediately
- Syncs every action back to the CRM
- Maintains full audit logs of every decision

**Tech stack:**
- Backend API: Node.js + Express + TypeScript
- Worker service: Node.js + BullMQ + Redis
- AI layer: Anthropic Claude API (claude-sonnet-4-6)
- Database: PostgreSQL with Prisma ORM
- Frontend: React + Vite + TypeScript + Tailwind CSS
- Email delivery: Resend (primary) with adapter pattern for others
- CRM integration: HubSpot adapter (extensible to Salesforce)
- Enrichment: Apollo.io adapter (extensible to Clay/Prospeo)
- Queue: Redis + BullMQ
- Auth: JWT with refresh tokens
- Deployment: Docker Compose (local), Railway/Render (cloud)

---

## BUILD ORDER — FOLLOW THIS EXACTLY

Work through each phase completely before moving to the next.
After each phase, run the tests and confirm they pass before proceeding.

### PHASE 1 — Project Scaffold & Database (Do this first)
1. Read `FOLDER_STRUCTURE.md` and create every folder and file listed
2. Read `PACKAGE_SPECS.md` and create all package.json files with exact dependencies
3. Read `ENV_SPEC.md` and create `.env.example` with every variable
4. Read `SCHEMA.sql` and implement the Prisma schema from it
5. Run `prisma migrate dev --name init` to apply migrations
6. Run `prisma db seed` to load seed data
7. Confirm: `npx prisma studio` shows all tables populated

### PHASE 2 — API Service (apps/api)
Build these modules in order. Each module = controller + service + routes + schema:

1. **Auth module** — JWT login, refresh, logout, middleware
2. **Users module** — CRUD, role management
3. **Accounts module** — company records CRUD
4. **Contacts module** — CRUD, CSV import, dedup, status management
5. **Campaigns module** — CRUD, pause/resume, status transitions
6. **Sequences module** — CRUD with nested steps
7. **Templates module** — CRUD with variable substitution preview
8. **Drafts module** — generate, approve, reject endpoints
9. **Messages module** — send, status, tracking
10. **Replies module** — classify, handle, route
11. **Suppression module** — add, check, list
12. **Audit module** — log writer, query, export
13. **Analytics module** — campaign metrics, reply rates, pipeline

For each module, create:
- `{module}.controller.ts` — HTTP handlers, input validation with Zod
- `{module}.service.ts` — business logic, DB queries
- `{module}.routes.ts` — Express router with middleware
- `{module}.schema.ts` — Zod validation schemas

Test each module with a curl command before moving to the next.

### PHASE 3 — AI Service Layer (packages/ai)
Build in this order:

1. **Prompt registry** — versioned prompt loader from DB prompt_versions table
2. **Research brief generator** — takes contact + account data, returns structured brief
3. **Draft generator** — takes brief + template + persona, returns subject + body
4. **Reply classifier** — classifies reply text into 6 categories with confidence score
5. **Personalization engine** — enriches drafts with contact-specific details
6. **Quality evaluator** — scores generated drafts before approval queue

Each AI function must:
- Log the prompt version used to audit_logs
- Store the raw response in the relevant table
- Handle rate limits with exponential backoff (3 retries max)
- Never throw uncaught exceptions — always return structured error objects

### PHASE 4 — Worker Service (apps/worker)
Build these jobs in order:

1. **enrichment.job.ts** — calls Apollo adapter, updates contact record, logs result
2. **scoring.job.ts** — applies ICP rules, writes score to contact, routes low-score to review
3. **generation.job.ts** — calls AI draft generator, creates draft record, queues for approval
4. **sending.job.ts** — checks suppression, sends via email adapter, logs deliverability event
5. **reply-check.job.ts** — polls for new replies, calls classifier, routes by classification
6. **followup.job.ts** — evaluates enrollment status, schedules next step or closes

Each job must:
- Be idempotent (safe to retry)
- Write a start and end audit log entry
- Update the relevant entity status on failure
- Respect rate limits via BullMQ job options (delay, attempts, backoff)

### PHASE 5 — Integration Adapters (packages/integrations)
Build each adapter with a consistent interface:

```typescript
interface EmailAdapter {
  send(message: OutboundMessage): Promise<SendResult>
  getDeliveryEvents(messageId: string): Promise<DeliveryEvent[]>
}

interface EnrichmentAdapter {
  enrich(contact: ContactInput): Promise<EnrichmentResult>
  validate(email: string): Promise<ValidationResult>
}

interface CrmAdapter {
  upsertContact(contact: Contact): Promise<string>
  createActivity(activity: Activity): Promise<string>
  createTask(task: Task): Promise<string>
}
```

Build these adapters:
1. **resend.adapter.ts** — email sending via Resend API
2. **apollo.adapter.ts** — enrichment via Apollo.io API
3. **hubspot.adapter.ts** — CRM sync via HubSpot API
4. **mock.adapters.ts** — mock implementations for all adapters (used in tests)

### PHASE 6 — Frontend (apps/web)
Build these pages in order:

1. **Login page** — email + password, JWT storage in httpOnly cookie
2. **Dashboard** — campaign overview, reply rate widget, meetings booked counter
3. **Campaigns list** — table with status, send count, reply rate, actions
4. **Campaign detail** — sequence steps, enrolled contacts, message log
5. **Contacts page** — table with enrichment status, ICP score, suppression flag
6. **CSV Import flow** — upload → preview → map fields → confirm → import
7. **Draft review queue** — card per draft, approve/edit/reject actions
8. **Reply inbox** — classified replies, route to task or suppress
9. **Audit log viewer** — filterable table, CSV export button
10. **Analytics dashboard** — reply rate chart, meetings booked, pipeline created

Use these UI rules:
- Tailwind CSS for all styling
- shadcn/ui components (Button, Table, Card, Badge, Dialog, Toast)
- React Query for all data fetching
- React Hook Form + Zod for all forms
- Optimistic updates on approve/reject/pause actions
- Loading skeletons on all async data
- Toast notifications for all actions (success + error)

### PHASE 7 — Docker & Deployment
1. Create `Dockerfile` for api service
2. Create `Dockerfile` for worker service
3. Create `Dockerfile` for web (nginx static serve)
4. Create `docker-compose.yml` with: api, worker, web, postgres, redis
5. Create `docker-compose.prod.yml` for production overrides
6. Create `scripts/deploy.sh` for Railway/Render deployment
7. Create `scripts/db-migrate.sh` for production migration
8. Add health check endpoints: `GET /health` on api and worker

---

## CODE QUALITY RULES — NEVER VIOLATE THESE

**Security**
- Never log API keys, passwords, or tokens anywhere
- All secrets via environment variables only — never hardcoded
- Validate and sanitize all user inputs with Zod before any DB operation
- Use parameterized queries — never string-interpolated SQL
- Rate limit all public API endpoints (express-rate-limit)
- CORS configured to allowed origins only

**Error handling**
- Every async function wrapped in try/catch
- All errors return `{ success: false, error: { code, message } }` — never raw stack traces to client
- Worker jobs catch errors, update entity status to 'failed', write audit log, then throw so BullMQ retries

**Audit logging**
- Every state change to campaigns, contacts, messages, replies writes an audit_log row
- Audit logs include: entity_type, entity_id, action, actor_type, actor_id, payload_json, created_at
- Audit logs are append-only — no UPDATE or DELETE ever on audit_logs table

**AI calls**
- All Claude API calls go through `packages/ai/src/client.ts` — never call Anthropic directly from API or worker
- Every Claude call logs: prompt_version_id, model used, input token count, output token count, latency_ms
- Prompt templates stored in DB prompt_versions table — never hardcoded in application code
- Reply classification must return confidence score — if confidence < 0.7, set needs_human_review = true

**Suppression**
- Check suppression list before EVERY send — never skip this check
- Unsubscribe must suppress within the same request — never async
- Bounces auto-add to suppression list after first hard bounce

---

## WHEN YOU GET STUCK

If an external API key is not available (Apollo, HubSpot, Resend), use the mock adapter
and add a TODO comment with the exact env variable name needed.

If a requirement is ambiguous, choose the more conservative option
(e.g., if unsure whether to auto-send or queue for approval, always queue for approval).

If a test fails and you cannot fix it within 2 attempts, write a
`KNOWN_ISSUES.md` entry describing the issue and move on.

---

## DEFINITION OF DONE

The build is complete when all of the following are true:

- [ ] `docker-compose up` starts all services without errors
- [ ] `GET /health` returns 200 on api and worker
- [ ] A contact can be imported from CSV end-to-end
- [ ] An enrichment job runs and updates the contact record
- [ ] A draft is generated, appears in the review queue, and can be approved
- [ ] An approved draft is sent and logged in messages table
- [ ] A simulated reply is classified correctly in all 6 categories
- [ ] An unsubscribe reply suppresses the contact immediately
- [ ] CRM sync writes the activity to HubSpot (or mock logs it)
- [ ] Audit log shows every action taken on any entity
- [ ] All audit logs are exportable as CSV
- [ ] Frontend loads, login works, dashboard shows campaign data
- [ ] Draft review queue shows pending drafts and approve/reject works

---

## FILES IN THIS PACKAGE

| File | Purpose |
|---|---|
| `CLAUDE.md` | This file — master build instructions |
| `FOLDER_STRUCTURE.md` | Every folder and file to create |
| `PACKAGE_SPECS.md` | All package.json files with exact versions |
| `ENV_SPEC.md` | Every environment variable with type, default, and description |
| `SCHEMA.sql` | Full PostgreSQL schema + Prisma schema |

**Start with CLAUDE.md (this file), then read all other files before writing a single line of code.**
