# FOLDER_STRUCTURE.md
# Create every file and folder listed below.
# Files marked [EMPTY] should be created as empty files with the correct extension.
# Files marked [FROM SCHEMA] should be populated from SCHEMA.sql.
# Files marked [FROM PACKAGE_SPECS] should be populated from PACKAGE_SPECS.md.
# All other files should be implemented per CLAUDE.md build instructions.

```
outreach-agent/                          # Monorepo root
│
├── CLAUDE.md                            # Master build instructions (this package)
├── FOLDER_STRUCTURE.md                  # This file
├── PACKAGE_SPECS.md                     # Package dependency specs
├── ENV_SPEC.md                          # Environment variable specs
├── SCHEMA.sql                           # Database schema
│
├── package.json                         # [FROM PACKAGE_SPECS] Root workspace config
├── tsconfig.base.json                   # Shared TypeScript base config
├── .env.example                         # [FROM ENV_SPEC] All env vars with placeholders
├── .env                                 # [CREATE — gitignored] Copy of .env.example filled in
├── .gitignore                           # Standard Node + secrets ignore
├── README.md                            # Project overview and quick start
├── docker-compose.yml                   # Local development stack
├── docker-compose.prod.yml              # Production overrides
│
├── apps/
│   │
│   ├── api/                             # Express API service
│   │   ├── package.json                 # [FROM PACKAGE_SPECS]
│   │   ├── tsconfig.json                # Extends tsconfig.base.json
│   │   ├── Dockerfile                   # Multi-stage Node build
│   │   ├── src/
│   │   │   ├── server.ts                # Entry point — starts Express server
│   │   │   ├── app.ts                   # Express app setup, middleware registration
│   │   │   ├── config/
│   │   │   │   ├── index.ts             # Exports all config from env vars
│   │   │   │   ├── database.ts          # Prisma client singleton
│   │   │   │   └── redis.ts             # Redis client singleton
│   │   │   ├── middleware/
│   │   │   │   ├── auth.middleware.ts   # JWT verification, attach user to req
│   │   │   │   ├── rbac.middleware.ts   # Role-based access (sdr|manager|admin)
│   │   │   │   ├── validate.middleware.ts # Zod schema validation wrapper
│   │   │   │   ├── rateLimit.middleware.ts # express-rate-limit config
│   │   │   │   ├── audit.middleware.ts  # Auto-log all mutating requests
│   │   │   │   └── error.middleware.ts  # Global error handler
│   │   │   ├── modules/
│   │   │   │   ├── auth/
│   │   │   │   │   ├── auth.controller.ts
│   │   │   │   │   ├── auth.service.ts
│   │   │   │   │   ├── auth.routes.ts
│   │   │   │   │   └── auth.schema.ts
│   │   │   │   ├── users/
│   │   │   │   │   ├── users.controller.ts
│   │   │   │   │   ├── users.service.ts
│   │   │   │   │   ├── users.routes.ts
│   │   │   │   │   └── users.schema.ts
│   │   │   │   ├── accounts/
│   │   │   │   │   ├── accounts.controller.ts
│   │   │   │   │   ├── accounts.service.ts
│   │   │   │   │   ├── accounts.routes.ts
│   │   │   │   │   └── accounts.schema.ts
│   │   │   │   ├── contacts/
│   │   │   │   │   ├── contacts.controller.ts
│   │   │   │   │   ├── contacts.service.ts
│   │   │   │   │   ├── contacts.routes.ts
│   │   │   │   │   ├── contacts.schema.ts
│   │   │   │   │   └── contacts.import.ts  # CSV parsing + dedup logic
│   │   │   │   ├── campaigns/
│   │   │   │   │   ├── campaigns.controller.ts
│   │   │   │   │   ├── campaigns.service.ts
│   │   │   │   │   ├── campaigns.routes.ts
│   │   │   │   │   └── campaigns.schema.ts
│   │   │   │   ├── sequences/
│   │   │   │   │   ├── sequences.controller.ts
│   │   │   │   │   ├── sequences.service.ts
│   │   │   │   │   ├── sequences.routes.ts
│   │   │   │   │   └── sequences.schema.ts
│   │   │   │   ├── templates/
│   │   │   │   │   ├── templates.controller.ts
│   │   │   │   │   ├── templates.service.ts
│   │   │   │   │   ├── templates.routes.ts
│   │   │   │   │   └── templates.schema.ts
│   │   │   │   ├── drafts/
│   │   │   │   │   ├── drafts.controller.ts
│   │   │   │   │   ├── drafts.service.ts
│   │   │   │   │   ├── drafts.routes.ts
│   │   │   │   │   └── drafts.schema.ts
│   │   │   │   ├── messages/
│   │   │   │   │   ├── messages.controller.ts
│   │   │   │   │   ├── messages.service.ts
│   │   │   │   │   ├── messages.routes.ts
│   │   │   │   │   └── messages.schema.ts
│   │   │   │   ├── replies/
│   │   │   │   │   ├── replies.controller.ts
│   │   │   │   │   ├── replies.service.ts
│   │   │   │   │   ├── replies.routes.ts
│   │   │   │   │   └── replies.schema.ts
│   │   │   │   ├── suppression/
│   │   │   │   │   ├── suppression.controller.ts
│   │   │   │   │   ├── suppression.service.ts
│   │   │   │   │   ├── suppression.routes.ts
│   │   │   │   │   └── suppression.schema.ts
│   │   │   │   ├── audit/
│   │   │   │   │   ├── audit.controller.ts
│   │   │   │   │   ├── audit.service.ts
│   │   │   │   │   ├── audit.routes.ts
│   │   │   │   │   └── audit.schema.ts
│   │   │   │   └── analytics/
│   │   │   │       ├── analytics.controller.ts
│   │   │   │       ├── analytics.service.ts
│   │   │   │       ├── analytics.routes.ts
│   │   │   │       └── analytics.schema.ts
│   │   │   └── utils/
│   │   │       ├── logger.ts            # Winston logger configured for JSON output
│   │   │       ├── pagination.ts        # Cursor-based pagination helpers
│   │   │       └── response.ts          # Standard API response wrappers
│   │   └── tests/
│   │       ├── auth.test.ts
│   │       ├── contacts.test.ts
│   │       ├── campaigns.test.ts
│   │       ├── drafts.test.ts
│   │       ├── replies.test.ts
│   │       └── suppression.test.ts
│   │
│   ├── worker/                          # BullMQ worker service
│   │   ├── package.json                 # [FROM PACKAGE_SPECS]
│   │   ├── tsconfig.json
│   │   ├── Dockerfile
│   │   └── src/
│   │       ├── index.ts                 # Entry point — registers all workers
│   │       ├── config/
│   │       │   ├── index.ts
│   │       │   └── queues.ts            # Queue names + BullMQ config constants
│   │       ├── jobs/
│   │       │   ├── enrichment.job.ts    # Enrich contact via Apollo adapter
│   │       │   ├── scoring.job.ts       # ICP score contact, route low-score to review
│   │       │   ├── generation.job.ts    # Generate AI draft, create pending draft record
│   │       │   ├── sending.job.ts       # Check suppression, send, log delivery event
│   │       │   ├── reply-check.job.ts   # Poll replies, classify, route by result
│   │       │   └── followup.job.ts      # Advance enrollment to next step or close
│   │       ├── processors/
│   │       │   └── sequence.processor.ts # Orchestrates enrollment step progression
│   │       └── schedulers/
│   │           └── cron.ts              # Cron expressions for recurring jobs
│   │
│   └── web/                             # React frontend
│       ├── package.json                 # [FROM PACKAGE_SPECS]
│       ├── tsconfig.json
│       ├── vite.config.ts
│       ├── tailwind.config.ts
│       ├── postcss.config.js
│       ├── index.html
│       ├── Dockerfile                   # Builds static files, serves via nginx
│       ├── nginx.conf                   # SPA fallback config
│       └── src/
│           ├── main.tsx                 # React root
│           ├── App.tsx                  # Router setup
│           ├── index.css                # Tailwind base imports
│           ├── lib/
│           │   ├── api.ts               # Axios instance with auth interceptors
│           │   ├── queryClient.ts       # React Query client config
│           │   └── utils.ts             # cn() and other helpers
│           ├── hooks/
│           │   ├── useAuth.ts           # Auth state + login/logout
│           │   ├── useCampaigns.ts      # Campaign CRUD queries
│           │   ├── useContacts.ts       # Contact CRUD queries
│           │   ├── useDrafts.ts         # Draft queue queries + mutations
│           │   └── useReplies.ts        # Reply inbox queries
│           ├── components/
│           │   ├── ui/                  # shadcn/ui components (auto-generated)
│           │   ├── layout/
│           │   │   ├── AppShell.tsx     # Sidebar + topbar wrapper
│           │   │   ├── Sidebar.tsx      # Navigation links
│           │   │   └── Topbar.tsx       # User menu + notifications
│           │   └── shared/
│           │       ├── DataTable.tsx    # Reusable sortable/filterable table
│           │       ├── StatusBadge.tsx  # Coloured status pill
│           │       ├── EmptyState.tsx   # Empty list placeholder
│           │       └── ConfirmDialog.tsx # Confirm destructive action dialog
│           ├── features/
│           │   ├── auth/
│           │   │   └── LoginPage.tsx
│           │   ├── dashboard/
│           │   │   └── DashboardPage.tsx
│           │   ├── campaigns/
│           │   │   ├── CampaignsPage.tsx
│           │   │   └── CampaignDetailPage.tsx
│           │   ├── contacts/
│           │   │   ├── ContactsPage.tsx
│           │   │   └── CsvImportFlow.tsx
│           │   ├── drafts/
│           │   │   └── DraftReviewPage.tsx
│           │   ├── replies/
│           │   │   └── ReplyInboxPage.tsx
│           │   ├── audit/
│           │   │   └── AuditLogPage.tsx
│           │   └── analytics/
│           │       └── AnalyticsPage.tsx
│           └── types/
│               ├── api.ts               # Response envelope types
│               ├── campaign.ts
│               ├── contact.ts
│               ├── message.ts
│               └── reply.ts
│
├── packages/
│   │
│   ├── db/                              # Prisma ORM layer
│   │   ├── package.json                 # [FROM PACKAGE_SPECS]
│   │   ├── prisma/
│   │   │   ├── schema.prisma            # [FROM SCHEMA.sql] Prisma schema
│   │   │   ├── migrations/              # Auto-generated by prisma migrate
│   │   │   └── seed.ts                  # Seed: admin user, demo campaign, prompt versions
│   │   └── src/
│   │       ├── index.ts                 # Exports prisma client + all query functions
│   │       └── queries/
│   │           ├── contacts.ts          # Contact query helpers
│   │           ├── campaigns.ts         # Campaign query helpers
│   │           ├── messages.ts          # Message query helpers
│   │           ├── replies.ts           # Reply query helpers
│   │           └── audit.ts             # Audit log writer helper
│   │
│   ├── ai/                              # Claude AI service layer
│   │   ├── package.json                 # [FROM PACKAGE_SPECS]
│   │   └── src/
│   │       ├── index.ts                 # Exports all AI functions
│   │       ├── client.ts                # Anthropic client singleton + retry wrapper
│   │       ├── registry.ts              # Prompt version loader from DB
│   │       ├── generators/
│   │       │   ├── research.ts          # Research brief generator
│   │       │   ├── draft.ts             # Email draft generator
│   │       │   └── personalization.ts   # Contact-specific detail enricher
│   │       ├── classifiers/
│   │       │   └── reply.ts             # Reply classifier (6 categories + confidence)
│   │       └── evaluators/
│   │           └── quality.ts           # Draft quality scorer
│   │
│   ├── integrations/                    # External service adapters
│   │   ├── package.json                 # [FROM PACKAGE_SPECS]
│   │   └── src/
│   │       ├── index.ts                 # Exports adapter factory
│   │       ├── types.ts                 # Shared adapter interface types
│   │       ├── email/
│   │       │   ├── resend.adapter.ts    # Resend email sending
│   │       │   └── index.ts             # Email adapter factory
│   │       ├── enrichment/
│   │       │   ├── apollo.adapter.ts    # Apollo.io enrichment
│   │       │   └── index.ts             # Enrichment adapter factory
│   │       ├── crm/
│   │       │   ├── hubspot.adapter.ts   # HubSpot CRM sync
│   │       │   └── index.ts             # CRM adapter factory
│   │       └── mock/
│   │           ├── email.mock.ts        # Mock email adapter for tests
│   │           ├── enrichment.mock.ts   # Mock enrichment adapter
│   │           └── crm.mock.ts          # Mock CRM adapter
│   │
│   └── shared/                          # Shared types, constants, utilities
│       ├── package.json                 # [FROM PACKAGE_SPECS]
│       └── src/
│           ├── index.ts
│           ├── types/
│           │   ├── campaign.ts
│           │   ├── contact.ts
│           │   ├── message.ts
│           │   └── reply.ts
│           ├── constants/
│           │   ├── channels.ts          # 'email' | 'linkedin' | 'sms'
│           │   ├── statuses.ts          # All status enum values
│           │   └── classifications.ts   # Reply classification labels
│           └── utils/
│               ├── validators.ts        # Email, phone, URL validators
│               ├── formatters.ts        # Date, number formatters
│               └── retry.ts             # Exponential backoff helper
│
├── docs/
│   ├── architecture.mmd                 # Mermaid diagram (from PRD)
│   ├── api-spec.md                      # API endpoint reference
│   ├── prompt-library.md                # All prompt templates + versions
│   └── runbook.md                       # Ops runbook: deploy, rollback, debug
│
├── scripts/
│   ├── db-migrate.sh                    # Run prisma migrate in production
│   ├── db-seed.sh                       # Run prisma seed in production
│   ├── deploy.sh                        # Railway/Render deploy script
│   └── backup.sh                        # pg_dump to S3/R2 bucket
│
└── tests/
    ├── integration/
    │   ├── import-enrich-send.test.ts   # Full lead → send flow
    │   └── reply-classify-suppress.test.ts # Reply → suppress flow
    └── e2e/
        └── campaign-flow.test.ts        # Browser test: login → create → approve → send
```
