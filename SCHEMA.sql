# SCHEMA.sql
# Full database schema for the AI Sales Outreach System.
#
# SECTION 1: PostgreSQL DDL — use this to understand the data model
# SECTION 2: Prisma Schema — implement this in packages/db/prisma/schema.prisma
# SECTION 3: Seed data — implement this in packages/db/prisma/seed.ts
#
# When building, implement SECTION 2 (Prisma) — Prisma generates the SQL.
# SECTION 1 is provided for reference and for direct DB tools.

# ══════════════════════════════════════════════════════════════════
# SECTION 1: PostgreSQL DDL (reference only)
# ══════════════════════════════════════════════════════════════════

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── USERS ───────────────────────────────────────────────────────
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(255) NOT NULL,
    email           VARCHAR(255) UNIQUE NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    role            VARCHAR(50) NOT NULL DEFAULT 'sdr',
    -- role values: 'super_admin' | 'admin' | 'manager' | 'sdr'
    status          VARCHAR(20) NOT NULL DEFAULT 'active',
    -- status values: 'active' | 'suspended' | 'invited'
    last_login_at   TIMESTAMP,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ─── REFRESH TOKENS ──────────────────────────────────────────────
CREATE TABLE refresh_tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  VARCHAR(255) NOT NULL,
    expires_at  TIMESTAMP NOT NULL,
    revoked     BOOLEAN DEFAULT FALSE,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ─── ACCOUNTS (companies) ────────────────────────────────────────
CREATE TABLE accounts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(255) NOT NULL,
    domain          VARCHAR(255),
    industry        VARCHAR(100),
    size_band       VARCHAR(50),
    -- size_band values: '1-10' | '11-50' | '51-200' | '201-500' | '501-1000' | '1000+'
    country         VARCHAR(100),
    website         VARCHAR(500),
    linkedin_url    VARCHAR(500),
    icp_score       INTEGER DEFAULT 0,   -- 0-100
    owner_user_id   UUID REFERENCES users(id),
    crm_id          VARCHAR(255),        -- External CRM record ID
    enriched        BOOLEAN DEFAULT FALSE,
    metadata_json   JSONB,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ─── CONTACTS ────────────────────────────────────────────────────
CREATE TABLE contacts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id      UUID REFERENCES accounts(id),
    owner_user_id   UUID REFERENCES users(id),
    first_name      VARCHAR(255),
    last_name       VARCHAR(255),
    name            VARCHAR(255) NOT NULL,   -- Full name (denormalized for speed)
    email           VARCHAR(255),
    email_verified  BOOLEAN DEFAULT FALSE,
    phone           VARCHAR(100),
    title           VARCHAR(255),
    seniority       VARCHAR(100),
    -- seniority values: 'c_suite' | 'vp' | 'director' | 'manager' | 'ic'
    department      VARCHAR(100),
    linkedin_url    VARCHAR(500),
    location        VARCHAR(255),
    timezone        VARCHAR(100),
    status          VARCHAR(50) NOT NULL DEFAULT 'new',
    -- status values: 'new' | 'enriching' | 'enriched' | 'review' | 'active' | 'suppressed' | 'bounced'
    icp_score       INTEGER DEFAULT 0,    -- 0-100
    icp_score_reason TEXT,
    enriched        BOOLEAN DEFAULT FALSE,
    validated       BOOLEAN DEFAULT FALSE,
    suppressed      BOOLEAN DEFAULT FALSE,
    crm_id          VARCHAR(255),
    source          VARCHAR(100),         -- 'csv' | 'crm' | 'manual' | 'api'
    source_file     VARCHAR(255),         -- Original CSV filename if imported
    metadata_json   JSONB,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ─── LEAD SOURCES ────────────────────────────────────────────────
CREATE TABLE lead_sources (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type            VARCHAR(50) NOT NULL,   -- 'csv' | 'crm_sync' | 'api' | 'form'
    name            VARCHAR(255),
    imported_by     UUID REFERENCES users(id),
    record_count    INTEGER DEFAULT 0,
    metadata_json   JSONB,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ─── KNOWLEDGE SNIPPETS ──────────────────────────────────────────
CREATE TABLE knowledge_snippets (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(255) NOT NULL,
    content     TEXT NOT NULL,
    category    VARCHAR(100),
    -- category values: 'product' | 'case_study' | 'offer' | 'objection' | 'persona'
    tags        TEXT[],
    created_by  UUID REFERENCES users(id),
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ─── PROMPT VERSIONS ─────────────────────────────────────────────
CREATE TABLE prompt_versions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(255) NOT NULL,
    purpose         VARCHAR(100) NOT NULL,
    -- purpose values: 'draft_generation' | 'reply_classification' | 'research_brief' | 'personalization' | 'quality_eval'
    prompt_text     TEXT NOT NULL,
    model_name      VARCHAR(100) NOT NULL,
    max_tokens      INTEGER NOT NULL,
    temperature     DECIMAL(3,2),
    version         INTEGER NOT NULL DEFAULT 1,
    is_active       BOOLEAN DEFAULT TRUE,   -- Only one active per purpose
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ─── TEMPLATES ───────────────────────────────────────────────────
CREATE TABLE templates (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                VARCHAR(255) NOT NULL,
    subject_template    TEXT,
    body_template       TEXT,
    persona             VARCHAR(100),
    touch_number        INTEGER,    -- 1-9 for 9-touch sequences
    campaign_type       VARCHAR(100),
    variables           TEXT[],     -- Variable names used: ['{{first_name}}', '{{company}}']
    created_by          UUID REFERENCES users(id),
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ─── CAMPAIGNS ───────────────────────────────────────────────────
CREATE TABLE campaigns (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                VARCHAR(255) NOT NULL,
    objective           VARCHAR(255),
    persona             VARCHAR(100),
    icp_rules_json      JSONB,      -- ICP scoring rules: industry, seniority, size, etc.
    status              VARCHAR(50) NOT NULL DEFAULT 'draft',
    -- status values: 'draft' | 'active' | 'paused' | 'completed' | 'archived'
    created_by          UUID REFERENCES users(id),
    paused_at           TIMESTAMP,
    paused_by           UUID REFERENCES users(id),
    completed_at        TIMESTAMP,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ─── SEQUENCES ───────────────────────────────────────────────────
CREATE TABLE sequences (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id     UUID NOT NULL REFERENCES campaigns(id),
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    version         INTEGER NOT NULL DEFAULT 1,
    status          VARCHAR(50) NOT NULL DEFAULT 'draft',
    -- status values: 'draft' | 'active' | 'archived'
    total_steps     INTEGER DEFAULT 0,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ─── SEQUENCE STEPS ──────────────────────────────────────────────
CREATE TABLE sequence_steps (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sequence_id     UUID NOT NULL REFERENCES sequences(id) ON DELETE CASCADE,
    step_order      INTEGER NOT NULL,
    channel         VARCHAR(50) NOT NULL DEFAULT 'email',
    -- channel values: 'email' | 'linkedin' | 'sms' | 'task'
    delay_hours     INTEGER NOT NULL DEFAULT 0,  -- Hours after previous step
    delay_type      VARCHAR(50) DEFAULT 'business_hours',
    -- delay_type values: 'calendar_hours' | 'business_hours'
    subject         TEXT,           -- Override template subject
    body_override   TEXT,           -- Override template body (optional)
    template_id     UUID REFERENCES templates(id),
    stop_conditions JSONB,          -- e.g. {"on_reply": true, "on_open": false}
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ─── CAMPAIGN ENROLLMENTS ────────────────────────────────────────
CREATE TABLE campaign_enrollments (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id         UUID NOT NULL REFERENCES campaigns(id),
    contact_id          UUID NOT NULL REFERENCES contacts(id),
    sequence_id         UUID NOT NULL REFERENCES sequences(id),
    enrolled_by         UUID REFERENCES users(id),
    current_step        INTEGER NOT NULL DEFAULT 0,
    next_step_id        UUID REFERENCES sequence_steps(id),
    next_send_at        TIMESTAMP,
    status              VARCHAR(50) NOT NULL DEFAULT 'active',
    -- status values: 'active' | 'paused' | 'completed' | 'suppressed' | 'bounced' | 'replied'
    paused              BOOLEAN DEFAULT FALSE,
    completed_at        TIMESTAMP,
    stop_reason         VARCHAR(100),
    -- stop_reason values: 'replied' | 'unsubscribed' | 'bounced' | 'campaign_paused' | 'manual' | 'completed'
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(campaign_id, contact_id)   -- One enrollment per contact per campaign
);

-- ─── ENRICHMENT JOBS ─────────────────────────────────────────────
CREATE TABLE enrichment_jobs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_id      UUID NOT NULL REFERENCES contacts(id),
    status          VARCHAR(50) NOT NULL DEFAULT 'pending',
    -- status values: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
    provider        VARCHAR(100) NOT NULL DEFAULT 'apollo',
    attempt         INTEGER DEFAULT 1,
    input_json      JSONB,
    output_json     JSONB,
    error_message   TEXT,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    started_at      TIMESTAMP,
    completed_at    TIMESTAMP
);

-- ─── DRAFTS ──────────────────────────────────────────────────────
CREATE TABLE drafts (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_id          UUID NOT NULL REFERENCES contacts(id),
    campaign_id         UUID NOT NULL REFERENCES campaigns(id),
    sequence_step_id    UUID REFERENCES sequence_steps(id),
    prompt_version_id   UUID REFERENCES prompt_versions(id),
    status              VARCHAR(50) NOT NULL DEFAULT 'pending_review',
    -- status values: 'generating' | 'pending_review' | 'approved' | 'rejected' | 'sent'
    subject             TEXT,
    body                TEXT,
    research_brief      TEXT,
    quality_score       DECIMAL(3,2),    -- 0.00-1.00
    personalization_score DECIMAL(3,2),
    ai_tokens_used      INTEGER,
    ai_latency_ms       INTEGER,
    reviewed_by         UUID REFERENCES users(id),
    reviewed_at         TIMESTAMP,
    rejection_reason    TEXT,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ─── MESSAGES ────────────────────────────────────────────────────
CREATE TABLE messages (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_id          UUID NOT NULL REFERENCES contacts(id),
    campaign_id         UUID NOT NULL REFERENCES campaigns(id),
    sequence_step_id    UUID REFERENCES sequence_steps(id),
    draft_id            UUID REFERENCES drafts(id),
    direction           VARCHAR(20) NOT NULL DEFAULT 'outbound',
    -- direction values: 'outbound' | 'inbound'
    channel             VARCHAR(50) NOT NULL DEFAULT 'email',
    from_address        VARCHAR(255),
    to_address          VARCHAR(255),
    subject             TEXT,
    body                TEXT,
    status              VARCHAR(50) NOT NULL DEFAULT 'pending',
    -- status values: 'pending' | 'queued' | 'sent' | 'delivered' | 'opened' | 'clicked' | 'bounced' | 'failed'
    provider            VARCHAR(100),   -- 'resend' | 'instantly' | 'lemlist'
    provider_message_id VARCHAR(255),   -- External provider's message ID
    sent_at             TIMESTAMP,
    opened_at           TIMESTAMP,
    clicked_at          TIMESTAMP,
    open_count          INTEGER DEFAULT 0,
    click_count         INTEGER DEFAULT 0,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ─── REPLIES ─────────────────────────────────────────────────────
CREATE TABLE replies (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id          UUID NOT NULL REFERENCES messages(id),
    contact_id          UUID NOT NULL REFERENCES contacts(id),
    raw_body            TEXT,
    classification      VARCHAR(100),
    -- classification values: 'interested' | 'objection' | 'out_of_office' | 'unsubscribe' | 'bounce' | 'unknown'
    confidence          DECIMAL(5,4),   -- 0.0000-1.0000
    summary             TEXT,
    needs_human_review  BOOLEAN DEFAULT FALSE,
    handled             BOOLEAN DEFAULT FALSE,
    handled_by          UUID REFERENCES users(id),
    handled_at          TIMESTAMP,
    handle_action       VARCHAR(100),
    -- handle_action values: 'created_task' | 'booked_meeting' | 'suppressed' | 'follow_up' | 'ignored'
    prompt_version_id   UUID REFERENCES prompt_versions(id),
    ai_tokens_used      INTEGER,
    received_at         TIMESTAMP NOT NULL,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ─── TASKS ───────────────────────────────────────────────────────
CREATE TABLE tasks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_id      UUID NOT NULL REFERENCES contacts(id),
    owner_user_id   UUID REFERENCES users(id),
    campaign_id     UUID REFERENCES campaigns(id),
    reply_id        UUID REFERENCES replies(id),
    task_type       VARCHAR(100) NOT NULL,
    -- task_type values: 'call' | 'linkedin_connect' | 'follow_up_email' | 'book_meeting' | 'review_reply'
    due_at          TIMESTAMP,
    status          VARCHAR(50) NOT NULL DEFAULT 'pending',
    -- status values: 'pending' | 'in_progress' | 'completed' | 'cancelled'
    priority        VARCHAR(20) DEFAULT 'normal',
    -- priority values: 'urgent' | 'high' | 'normal' | 'low'
    description     TEXT,
    notes           TEXT,
    completed_at    TIMESTAMP,
    completed_by    UUID REFERENCES users(id),
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ─── DELIVERABILITY EVENTS ───────────────────────────────────────
CREATE TABLE deliverability_events (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id          UUID NOT NULL REFERENCES messages(id),
    event_type          VARCHAR(100) NOT NULL,
    -- event_type values: 'sent' | 'delivered' | 'opened' | 'clicked' | 'bounced' | 'complained' | 'unsubscribed'
    bounce_type         VARCHAR(50),
    -- bounce_type values: 'hard' | 'soft' | null
    provider            VARCHAR(100),
    provider_event_id   VARCHAR(255),
    event_at            TIMESTAMP NOT NULL,
    provider_payload_json JSONB,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ─── SUPPRESSION LIST ────────────────────────────────────────────
CREATE TABLE suppression_lists (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email       VARCHAR(255) NOT NULL,
    reason      VARCHAR(255),
    -- reason values: 'unsubscribe' | 'hard_bounce' | 'complained' | 'manual' | 'global'
    source      VARCHAR(100),
    -- source values: 'reply_handler' | 'delivery_webhook' | 'manual_import' | 'api'
    added_by    UUID REFERENCES users(id),
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(email)
);

-- ─── AUDIT LOGS ──────────────────────────────────────────────────
-- IMPORTANT: This table is APPEND-ONLY. Never UPDATE or DELETE rows.
CREATE TABLE audit_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type     VARCHAR(100) NOT NULL,
    -- entity_type values: 'campaign' | 'contact' | 'message' | 'draft' | 'reply' | 'suppression' | 'user'
    entity_id       UUID NOT NULL,
    action          VARCHAR(100) NOT NULL,
    -- action values: 'created' | 'updated' | 'deleted' | 'sent' | 'approved' | 'rejected' | 'suppressed' | 'classified' | 'synced_crm'
    actor_type      VARCHAR(100),
    -- actor_type values: 'user' | 'system' | 'worker' | 'webhook'
    actor_id        UUID,
    summary         TEXT,
    payload_json    JSONB,
    ip_address      INET,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ─── INDEXES ─────────────────────────────────────────────────────
CREATE INDEX idx_contacts_account_id ON contacts(account_id);
CREATE INDEX idx_contacts_status ON contacts(status);
CREATE INDEX idx_contacts_email ON contacts(email);
CREATE INDEX idx_contacts_icp_score ON contacts(icp_score);
CREATE INDEX idx_contacts_suppressed ON contacts(suppressed);

CREATE INDEX idx_campaign_enrollments_campaign_id ON campaign_enrollments(campaign_id);
CREATE INDEX idx_campaign_enrollments_contact_id ON campaign_enrollments(contact_id);
CREATE INDEX idx_campaign_enrollments_status ON campaign_enrollments(status);
CREATE INDEX idx_campaign_enrollments_next_send_at ON campaign_enrollments(next_send_at);

CREATE INDEX idx_messages_contact_id ON messages(contact_id);
CREATE INDEX idx_messages_campaign_id ON messages(campaign_id);
CREATE INDEX idx_messages_status ON messages(status);
CREATE INDEX idx_messages_sent_at ON messages(sent_at);

CREATE INDEX idx_drafts_status ON drafts(status);
CREATE INDEX idx_drafts_campaign_id ON drafts(campaign_id);

CREATE INDEX idx_replies_message_id ON replies(message_id);
CREATE INDEX idx_replies_contact_id ON replies(contact_id);
CREATE INDEX idx_replies_classification ON replies(classification);
CREATE INDEX idx_replies_needs_human_review ON replies(needs_human_review);
CREATE INDEX idx_replies_handled ON replies(handled);

CREATE INDEX idx_deliverability_events_message_id ON deliverability_events(message_id);
CREATE INDEX idx_deliverability_events_event_type ON deliverability_events(event_type);

CREATE INDEX idx_suppression_email ON suppression_lists(email);

CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_actor ON audit_logs(actor_type, actor_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);

CREATE INDEX idx_enrichment_jobs_contact_id ON enrichment_jobs(contact_id);
CREATE INDEX idx_enrichment_jobs_status ON enrichment_jobs(status);


# ══════════════════════════════════════════════════════════════════
# SECTION 2: PRISMA SCHEMA
# Implement this in packages/db/prisma/schema.prisma
# ══════════════════════════════════════════════════════════════════

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id             String    @id @default(uuid())
  name           String
  email          String    @unique
  passwordHash   String    @map("password_hash")
  role           UserRole  @default(sdr)
  status         String    @default("active")
  lastLoginAt    DateTime? @map("last_login_at")
  createdAt      DateTime  @default(now()) @map("created_at")
  updatedAt      DateTime  @updatedAt @map("updated_at")

  // Relations
  ownedAccounts       Account[]          @relation("AccountOwner")
  ownedContacts       Contact[]          @relation("ContactOwner")
  createdCampaigns    Campaign[]         @relation("CampaignCreator")
  pausedCampaigns     Campaign[]         @relation("CampaignPauser")
  enrollments         CampaignEnrollment[] @relation("EnrolledBy")
  reviewedDrafts      Draft[]            @relation("DraftReviewer")
  handledReplies      Reply[]            @relation("ReplyHandler")
  assignedTasks       Task[]             @relation("TaskOwner")
  completedTasks      Task[]             @relation("TaskCompleter")
  createdTemplates    Template[]
  createdSnippets     KnowledgeSnippet[]
  createdPrompts      PromptVersion[]
  addedSuppressions   SuppressionList[]
  refreshTokens       RefreshToken[]

  @@map("users")
}

enum UserRole {
  super_admin
  admin
  manager
  sdr

  @@map("user_role")
}

model RefreshToken {
  id         String   @id @default(uuid())
  userId     String   @map("user_id")
  tokenHash  String   @map("token_hash")
  expiresAt  DateTime @map("expires_at")
  revoked    Boolean  @default(false)
  createdAt  DateTime @default(now()) @map("created_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("refresh_tokens")
}

model Account {
  id            String    @id @default(uuid())
  name          String
  domain        String?
  industry      String?
  sizeBand      String?   @map("size_band")
  country       String?
  website       String?
  linkedinUrl   String?   @map("linkedin_url")
  icpScore      Int       @default(0) @map("icp_score")
  ownerUserId   String?   @map("owner_user_id")
  crmId         String?   @map("crm_id")
  enriched      Boolean   @default(false)
  metadataJson  Json?     @map("metadata_json")
  createdAt     DateTime  @default(now()) @map("created_at")
  updatedAt     DateTime  @updatedAt @map("updated_at")

  owner    User?     @relation("AccountOwner", fields: [ownerUserId], references: [id])
  contacts Contact[]

  @@map("accounts")
}

model Contact {
  id                  String    @id @default(uuid())
  accountId           String?   @map("account_id")
  ownerUserId         String?   @map("owner_user_id")
  firstName           String?   @map("first_name")
  lastName            String?   @map("last_name")
  name                String
  email               String?
  emailVerified       Boolean   @default(false) @map("email_verified")
  phone               String?
  title               String?
  seniority           String?
  department          String?
  linkedinUrl         String?   @map("linkedin_url")
  location            String?
  timezone            String?
  status              String    @default("new")
  icpScore            Int       @default(0) @map("icp_score")
  icpScoreReason      String?   @map("icp_score_reason")
  enriched            Boolean   @default(false)
  validated           Boolean   @default(false)
  suppressed          Boolean   @default(false)
  crmId               String?   @map("crm_id")
  source              String?
  sourceFile          String?   @map("source_file")
  metadataJson        Json?     @map("metadata_json")
  createdAt           DateTime  @default(now()) @map("created_at")
  updatedAt           DateTime  @updatedAt @map("updated_at")

  account      Account?              @relation(fields: [accountId], references: [id])
  owner        User?                 @relation("ContactOwner", fields: [ownerUserId], references: [id])
  enrollments  CampaignEnrollment[]
  enrichmentJobs EnrichmentJob[]
  drafts       Draft[]
  messages     Message[]
  replies      Reply[]
  tasks        Task[]

  @@map("contacts")
}

model KnowledgeSnippet {
  id          String   @id @default(uuid())
  name        String
  content     String
  category    String?
  tags        String[]
  createdBy   String?  @map("created_by")
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  creator User? @relation(fields: [createdBy], references: [id])

  @@map("knowledge_snippets")
}

model PromptVersion {
  id          String   @id @default(uuid())
  name        String
  purpose     String
  promptText  String   @map("prompt_text")
  modelName   String   @map("model_name")
  maxTokens   Int      @map("max_tokens")
  temperature Decimal?
  version     Int      @default(1)
  isActive    Boolean  @default(true) @map("is_active")
  createdBy   String?  @map("created_by")
  createdAt   DateTime @default(now()) @map("created_at")

  creator User?   @relation(fields: [createdBy], references: [id])
  drafts  Draft[]
  replies Reply[]

  @@map("prompt_versions")
}

model Template {
  id              String   @id @default(uuid())
  name            String
  subjectTemplate String?  @map("subject_template")
  bodyTemplate    String?  @map("body_template")
  persona         String?
  touchNumber     Int?     @map("touch_number")
  campaignType    String?  @map("campaign_type")
  variables       String[]
  createdBy       String?  @map("created_by")
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  creator       User?          @relation(fields: [createdBy], references: [id])
  sequenceSteps SequenceStep[]

  @@map("templates")
}

model Campaign {
  id            String    @id @default(uuid())
  name          String
  objective     String?
  persona       String?
  icpRulesJson  Json?     @map("icp_rules_json")
  status        String    @default("draft")
  createdBy     String?   @map("created_by")
  pausedAt      DateTime? @map("paused_at")
  pausedBy      String?   @map("paused_by")
  completedAt   DateTime? @map("completed_at")
  createdAt     DateTime  @default(now()) @map("created_at")
  updatedAt     DateTime  @updatedAt @map("updated_at")

  creator     User?                 @relation("CampaignCreator", fields: [createdBy], references: [id])
  pauser      User?                 @relation("CampaignPauser", fields: [pausedBy], references: [id])
  sequences   Sequence[]
  enrollments CampaignEnrollment[]
  drafts      Draft[]
  messages    Message[]
  tasks       Task[]

  @@map("campaigns")
}

model Sequence {
  id          String   @id @default(uuid())
  campaignId  String   @map("campaign_id")
  name        String
  description String?
  version     Int      @default(1)
  status      String   @default("draft")
  totalSteps  Int      @default(0) @map("total_steps")
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  campaign    Campaign             @relation(fields: [campaignId], references: [id])
  steps       SequenceStep[]
  enrollments CampaignEnrollment[]

  @@map("sequences")
}

model SequenceStep {
  id              String   @id @default(uuid())
  sequenceId      String   @map("sequence_id")
  stepOrder       Int      @map("step_order")
  channel         String   @default("email")
  delayHours      Int      @default(0) @map("delay_hours")
  delayType       String   @default("business_hours") @map("delay_type")
  subject         String?
  bodyOverride    String?  @map("body_override")
  templateId      String?  @map("template_id")
  stopConditions  Json?    @map("stop_conditions")
  createdAt       DateTime @default(now()) @map("created_at")

  sequence    Sequence  @relation(fields: [sequenceId], references: [id], onDelete: Cascade)
  template    Template? @relation(fields: [templateId], references: [id])
  drafts      Draft[]
  messages    Message[]
  nextStepEnrollments CampaignEnrollment[] @relation("NextStep")

  @@map("sequence_steps")
}

model CampaignEnrollment {
  id            String    @id @default(uuid())
  campaignId    String    @map("campaign_id")
  contactId     String    @map("contact_id")
  sequenceId    String    @map("sequence_id")
  enrolledBy    String?   @map("enrolled_by")
  currentStep   Int       @default(0) @map("current_step")
  nextStepId    String?   @map("next_step_id")
  nextSendAt    DateTime? @map("next_send_at")
  status        String    @default("active")
  paused        Boolean   @default(false)
  completedAt   DateTime? @map("completed_at")
  stopReason    String?   @map("stop_reason")
  createdAt     DateTime  @default(now()) @map("created_at")
  updatedAt     DateTime  @updatedAt @map("updated_at")

  campaign  Campaign     @relation(fields: [campaignId], references: [id])
  contact   Contact      @relation(fields: [contactId], references: [id])
  sequence  Sequence     @relation(fields: [sequenceId], references: [id])
  enrolledByUser User?   @relation("EnrolledBy", fields: [enrolledBy], references: [id])
  nextStep  SequenceStep? @relation("NextStep", fields: [nextStepId], references: [id])

  @@unique([campaignId, contactId])
  @@map("campaign_enrollments")
}

model EnrichmentJob {
  id            String    @id @default(uuid())
  contactId     String    @map("contact_id")
  status        String    @default("pending")
  provider      String    @default("apollo")
  attempt       Int       @default(1)
  inputJson     Json?     @map("input_json")
  outputJson    Json?     @map("output_json")
  errorMessage  String?   @map("error_message")
  createdAt     DateTime  @default(now()) @map("created_at")
  startedAt     DateTime? @map("started_at")
  completedAt   DateTime? @map("completed_at")

  contact Contact @relation(fields: [contactId], references: [id])

  @@map("enrichment_jobs")
}

model Draft {
  id                    String    @id @default(uuid())
  contactId             String    @map("contact_id")
  campaignId            String    @map("campaign_id")
  sequenceStepId        String?   @map("sequence_step_id")
  promptVersionId       String?   @map("prompt_version_id")
  status                String    @default("pending_review")
  subject               String?
  body                  String?
  researchBrief         String?   @map("research_brief")
  qualityScore          Decimal?  @map("quality_score")
  personalizationScore  Decimal?  @map("personalization_score")
  aiTokensUsed          Int?      @map("ai_tokens_used")
  aiLatencyMs           Int?      @map("ai_latency_ms")
  reviewedBy            String?   @map("reviewed_by")
  reviewedAt            DateTime? @map("reviewed_at")
  rejectionReason       String?   @map("rejection_reason")
  createdAt             DateTime  @default(now()) @map("created_at")
  updatedAt             DateTime  @updatedAt @map("updated_at")

  contact       Contact        @relation(fields: [contactId], references: [id])
  campaign      Campaign       @relation(fields: [campaignId], references: [id])
  sequenceStep  SequenceStep?  @relation(fields: [sequenceStepId], references: [id])
  promptVersion PromptVersion? @relation(fields: [promptVersionId], references: [id])
  reviewer      User?          @relation("DraftReviewer", fields: [reviewedBy], references: [id])
  messages      Message[]

  @@map("drafts")
}

model Message {
  id                String    @id @default(uuid())
  contactId         String    @map("contact_id")
  campaignId        String    @map("campaign_id")
  sequenceStepId    String?   @map("sequence_step_id")
  draftId           String?   @map("draft_id")
  direction         String    @default("outbound")
  channel           String    @default("email")
  fromAddress       String?   @map("from_address")
  toAddress         String?   @map("to_address")
  subject           String?
  body              String?
  status            String    @default("pending")
  provider          String?
  providerMessageId String?   @map("provider_message_id")
  sentAt            DateTime? @map("sent_at")
  openedAt          DateTime? @map("opened_at")
  clickedAt         DateTime? @map("clicked_at")
  openCount         Int       @default(0) @map("open_count")
  clickCount        Int       @default(0) @map("click_count")
  createdAt         DateTime  @default(now()) @map("created_at")
  updatedAt         DateTime  @updatedAt @map("updated_at")

  contact          Contact              @relation(fields: [contactId], references: [id])
  campaign         Campaign             @relation(fields: [campaignId], references: [id])
  sequenceStep     SequenceStep?        @relation(fields: [sequenceStepId], references: [id])
  draft            Draft?               @relation(fields: [draftId], references: [id])
  replies          Reply[]
  deliveryEvents   DeliverabilityEvent[]

  @@map("messages")
}

model Reply {
  id                String    @id @default(uuid())
  messageId         String    @map("message_id")
  contactId         String    @map("contact_id")
  rawBody           String?   @map("raw_body")
  classification    String?
  confidence        Decimal?
  summary           String?
  needsHumanReview  Boolean   @default(false) @map("needs_human_review")
  handled           Boolean   @default(false)
  handledBy         String?   @map("handled_by")
  handledAt         DateTime? @map("handled_at")
  handleAction      String?   @map("handle_action")
  promptVersionId   String?   @map("prompt_version_id")
  aiTokensUsed      Int?      @map("ai_tokens_used")
  receivedAt        DateTime  @map("received_at")
  createdAt         DateTime  @default(now()) @map("created_at")

  message       Message        @relation(fields: [messageId], references: [id])
  contact       Contact        @relation(fields: [contactId], references: [id])
  handler       User?          @relation("ReplyHandler", fields: [handledBy], references: [id])
  promptVersion PromptVersion? @relation(fields: [promptVersionId], references: [id])
  tasks         Task[]

  @@map("replies")
}

model Task {
  id            String    @id @default(uuid())
  contactId     String    @map("contact_id")
  ownerUserId   String?   @map("owner_user_id")
  campaignId    String?   @map("campaign_id")
  replyId       String?   @map("reply_id")
  taskType      String    @map("task_type")
  dueAt         DateTime? @map("due_at")
  status        String    @default("pending")
  priority      String    @default("normal")
  description   String?
  notes         String?
  completedAt   DateTime? @map("completed_at")
  completedBy   String?   @map("completed_by")
  createdAt     DateTime  @default(now()) @map("created_at")
  updatedAt     DateTime  @updatedAt @map("updated_at")

  contact      Contact   @relation(fields: [contactId], references: [id])
  owner        User?     @relation("TaskOwner", fields: [ownerUserId], references: [id])
  campaign     Campaign? @relation(fields: [campaignId], references: [id])
  reply        Reply?    @relation(fields: [replyId], references: [id])
  completer    User?     @relation("TaskCompleter", fields: [completedBy], references: [id])

  @@map("tasks")
}

model DeliverabilityEvent {
  id                  String   @id @default(uuid())
  messageId           String   @map("message_id")
  eventType           String   @map("event_type")
  bounceType          String?  @map("bounce_type")
  provider            String?
  providerEventId     String?  @map("provider_event_id")
  eventAt             DateTime @map("event_at")
  providerPayloadJson Json?    @map("provider_payload_json")
  createdAt           DateTime @default(now()) @map("created_at")

  message Message @relation(fields: [messageId], references: [id])

  @@map("deliverability_events")
}

model SuppressionList {
  id        String   @id @default(uuid())
  email     String   @unique
  reason    String?
  source    String?
  addedBy   String?  @map("added_by")
  createdAt DateTime @default(now()) @map("created_at")

  adder User? @relation(fields: [addedBy], references: [id])

  @@map("suppression_lists")
}

model AuditLog {
  id          String   @id @default(uuid())
  entityType  String   @map("entity_type")
  entityId    String   @map("entity_id")
  action      String
  actorType   String?  @map("actor_type")
  actorId     String?  @map("actor_id")
  summary     String?
  payloadJson Json?    @map("payload_json")
  ipAddress   String?  @map("ip_address")
  createdAt   DateTime @default(now()) @map("created_at")

  @@map("audit_logs")
}
```


# ══════════════════════════════════════════════════════════════════
# SECTION 3: SEED DATA
# Implement this in packages/db/prisma/seed.ts
# ══════════════════════════════════════════════════════════════════

# The seed script must create:

# 1. ONE admin user
#    email: from SEED_ADMIN_EMAIL env var
#    password: from SEED_ADMIN_PASSWORD env var (bcrypt hashed, 12 rounds)
#    role: super_admin
#    name: from SEED_ADMIN_NAME env var

# 2. ONE SDR user (for testing)
#    email: sdr@example.com
#    password: Test@Password123 (bcrypt hashed)
#    role: sdr
#    name: Test SDR

# 3. FOUR prompt versions (one per purpose)
#    Each with is_active: true
#    Purposes: draft_generation, reply_classification, research_brief, quality_eval
#    Model: from ANTHROPIC_MODEL_DRAFT env var for draft/research
#    Model: from ANTHROPIC_MODEL_CLASSIFY env var for classification
#    Use placeholder prompt text that includes:
#      {{contact_name}}, {{company}}, {{title}}, {{pain_points}} for draft prompts
#      {{reply_text}} for classification prompt

# 4. THREE knowledge snippets
#    Category 'product': eMOBIQ AI description (vibe coding platform)
#    Category 'offer': Free pilot offer description
#    Category 'case_study': Generic SME digital transformation story

# 5. TWO sample templates
#    Touch 1 (value email): Uses {{contact_name}}, {{company}}
#    Touch 7 (webinar invite): Uses {{contact_name}}, {{webinar_date}}

# 6. ONE sample campaign
#    Name: "eMOBIQ AI Launch Campaign"
#    Status: draft
#    Created by: admin user

# 7. ONE sequence for the campaign
#    Name: "9-Touch IHL Sequence"
#    With 9 steps (step_order 1-9, all email channel)
#    Delays: 0, 96, 96, 120, 120, 120, 120, 96, 72 hours

# 8. THREE sample contacts (with accounts)
#    Contact 1: Dean of Computing, NUS, Singapore
#    Contact 2: CTO, ERP Reseller firm, Malaysia
#    Contact 3: Founder, Tech startup, UAE
#    All status: 'new', enriched: false, suppressed: false
