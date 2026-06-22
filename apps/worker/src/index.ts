// Worker entry point: starts pg-boss, registers all six job workers and the
// recurring schedules, and exposes a /health endpoint. Graceful shutdown stops
// the queue cleanly.
import { createServer } from 'node:http';
import { prisma } from '@outreach/db';
import { config } from './config';
import { logger } from './logger';
import { startQueue, stopQueue, registerWorker, QUEUES } from './config/queues';
import { registerSchedules } from './schedulers/cron';
import { enrichmentJob } from './jobs/enrichment.job';
import { scoringJob } from './jobs/scoring.job';
import { generationJob } from './jobs/generation.job';
import { sendingJob } from './jobs/sending.job';
import { replyCheckJob } from './jobs/reply-check.job';
import { followupJob } from './jobs/followup.job';

let ready = false;

// Minimal health server (CLAUDE.md DoD: GET /health returns 200 on the worker).
function startHealthServer(): ReturnType<typeof createServer> {
  const server = createServer(async (req, res) => {
    if (req.url === '/health') {
      let db = 'unknown';
      try {
        await prisma.$queryRaw`SELECT 1`;
        db = 'connected';
      } catch {
        db = 'disconnected';
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          success: true,
          data: { status: 'ok', service: 'worker', ready, db, uptime: process.uptime() },
        }),
      );
      return;
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: { code: 'NOT_FOUND', message: 'Not found' } }));
  });
  server.listen(config.port, () => logger.info('worker health server listening', { port: config.port }));
  return server;
}

async function registerWorkers(): Promise<void> {
  await registerWorker(QUEUES.enrichment, config.concurrency.enrichment, enrichmentJob);
  await registerWorker(QUEUES.scoring, config.concurrency.scoring, scoringJob);
  await registerWorker(QUEUES.generation, config.concurrency.generation, generationJob);
  await registerWorker(QUEUES.sending, config.concurrency.sending, sendingJob);
  await registerWorker(QUEUES.replyCheck, config.concurrency.replyCheck, () => replyCheckJob());
  await registerWorker(QUEUES.followup, config.concurrency.followup, () => followupJob());
}

async function main(): Promise<void> {
  const health = startHealthServer();

  await startQueue();
  await registerWorkers();
  await registerSchedules();
  ready = true;
  logger.info('worker ready', { env: config.env });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info('worker shutting down', { signal });
    ready = false;
    health.close();
    try {
      await stopQueue();
      await prisma.$disconnect();
    } finally {
      process.exit(0);
    }
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error('worker failed to start', {
    message: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});
