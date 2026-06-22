// Worker configuration. The queue runs on the same Supabase Postgres as the app
// via pg-boss (no Redis at this stage), so it needs a SESSION-mode connection —
// the transaction pooler (pgbouncer) is incompatible with pg-boss. We use
// DIRECT_URL (Supabase session pooler, port 5432) for the queue.
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

// Walk up to find the monorepo root .env (workspaces run with cwd = package dir).
function loadEnvFile(): void {
  let dir = process.cwd();
  for (let i = 0; i < 6; i += 1) {
    const candidate = join(dir, '.env');
    if (existsSync(candidate)) {
      dotenv.config({ path: candidate });
      return;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  dotenv.config();
}

loadEnvFile();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  WORKER_PORT: z.coerce.number().int().positive().default(3002),

  // Queue connection: prefer DIRECT_URL (session mode); fall back to DATABASE_URL.
  DIRECT_URL: z.string().optional(),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  WORKER_CONCURRENCY_ENRICHMENT: z.coerce.number().int().positive().default(5),
  WORKER_CONCURRENCY_GENERATION: z.coerce.number().int().positive().default(3),
  WORKER_CONCURRENCY_SENDING: z.coerce.number().int().positive().default(10),
  WORKER_CONCURRENCY_REPLY_CHECK: z.coerce.number().int().positive().default(5),

  // Cron cadences (node-cron syntax) for the polling jobs.
  REPLY_CHECK_CRON: z.string().default('*/5 * * * *'),
  FOLLOWUP_CRON: z.string().default('*/10 * * * *'),

  // When the reply-check worker classifies an inbound reply as "interested",
  // auto-create an Opportunity (the worker's analog of an inbox conversion).
  WORKER_AUTO_CREATE_OPPORTUNITY: z.coerce.boolean().default(true),

  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'debug']).default('info'),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  // eslint-disable-next-line no-console
  console.error(`Invalid worker environment configuration:\n${issues}`);
  process.exit(1);
}

const env = parsed.data;

// pg-boss needs a session connection. Supabase requires SSL for node-postgres.
const queueConnectionString = env.DIRECT_URL || env.DATABASE_URL;
const needsSsl = /supabase\.com|supabase\.co/.test(queueConnectionString);

export const config = {
  env: env.NODE_ENV,
  isProd: env.NODE_ENV === 'production',
  port: env.WORKER_PORT,
  queue: {
    connectionString: queueConnectionString,
    ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
    schema: 'pgboss',
  },
  concurrency: {
    enrichment: env.WORKER_CONCURRENCY_ENRICHMENT,
    generation: env.WORKER_CONCURRENCY_GENERATION,
    sending: env.WORKER_CONCURRENCY_SENDING,
    replyCheck: env.WORKER_CONCURRENCY_REPLY_CHECK,
    scoring: env.WORKER_CONCURRENCY_ENRICHMENT,
    followup: 2,
  },
  cron: {
    replyCheck: env.REPLY_CHECK_CRON,
    followup: env.FOLLOWUP_CRON,
  },
  autoCreateOpportunity: env.WORKER_AUTO_CREATE_OPPORTUNITY,
  log: { level: env.LOG_LEVEL },
} as const;

export type WorkerConfig = typeof config;
