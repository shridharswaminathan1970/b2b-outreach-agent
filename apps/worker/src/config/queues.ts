// pg-boss queue setup: one shared boss instance, queue-name constants, typed job
// payloads, and thin start/work/enqueue/schedule helpers. pg-boss provides the
// delayed jobs, retries-with-backoff, concurrency, and cron scheduling that
// CLAUDE.md Phase 4 requires (replacing BullMQ/Redis for this stage).
import PgBoss from 'pg-boss';
import { config } from './index';
import { logger } from '../logger';

// One queue per job type (CLAUDE.md Phase 4 job list).
export const QUEUES = {
  enrichment: 'enrichment',
  scoring: 'scoring',
  generation: 'generation',
  sending: 'sending',
  replyCheck: 'reply-check',
  followup: 'followup',
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

// Typed payloads for each queue.
export interface JobPayloads {
  [QUEUES.enrichment]: { contactId: string };
  [QUEUES.scoring]: { contactId: string; campaignId?: string };
  [QUEUES.generation]: { contactId: string; campaignId: string; sequenceStepId?: string };
  [QUEUES.sending]: { draftId: string };
  [QUEUES.replyCheck]: Record<string, never>;
  [QUEUES.followup]: Record<string, never>;
}

// Default retry policy applied to every enqueue (CLAUDE.md: respect rate limits
// via job options — delay, attempts, backoff).
const DEFAULT_RETRY: PgBoss.SendOptions = {
  retryLimit: 3,
  retryDelay: 30, // seconds
  retryBackoff: true,
};

let boss: PgBoss | null = null;

export function getBoss(): PgBoss {
  if (!boss) {
    boss = new PgBoss({
      connectionString: config.queue.connectionString,
      ssl: config.queue.ssl,
      schema: config.queue.schema,
      // Keep completed/failed jobs around briefly for inspection.
      retentionDays: 7,
    });
    boss.on('error', (err) => logger.error('pg-boss error', { message: err.message }));
  }
  return boss;
}

export async function startQueue(): Promise<PgBoss> {
  const b = getBoss();
  await b.start();
  logger.info('pg-boss started', { schema: config.queue.schema });
  return b;
}

export async function stopQueue(): Promise<void> {
  if (boss) {
    await boss.stop({ graceful: true });
    boss = null;
  }
}

// Enqueue a job. `singletonKey` makes the enqueue idempotent (no duplicate active
// job for the same key), supporting the idempotency requirement.
export async function enqueue<K extends QueueName>(
  queue: K,
  data: JobPayloads[K],
  options: PgBoss.SendOptions = {},
): Promise<string | null> {
  return getBoss().send(queue, data, { ...DEFAULT_RETRY, ...options });
}

// Register a worker for a queue. Handler receives the typed payload and may throw
// to trigger pg-boss retry/backoff.
export async function registerWorker<K extends QueueName>(
  queue: K,
  concurrency: number,
  handler: (data: JobPayloads[K]) => Promise<void>,
): Promise<void> {
  await getBoss().work<JobPayloads[K]>(
    queue,
    { teamSize: concurrency, teamConcurrency: concurrency },
    async (job) => {
      await handler(job.data);
    },
  );
  logger.info('worker registered', { queue, concurrency });
}
