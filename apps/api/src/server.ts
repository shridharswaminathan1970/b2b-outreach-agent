// API service entry point. Builds the Express app and starts listening.
import { createApp } from './app';
import { config } from './config';
import { logger } from './utils/logger';
import { prisma } from './config/database';

async function main(): Promise<void> {
  const app = createApp();

  const server = app.listen(config.port, () => {
    logger.info(`API listening on port ${config.port} (${config.env})`);
  });

  // Graceful shutdown: stop accepting connections, then close the DB pool.
  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`${signal} received, shutting down...`);
    server.close(async () => {
      try {
        await prisma.$disconnect();
      } catch {
        // best-effort
      }
      process.exit(0);
    });
    // Force-exit if connections do not drain in time.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error('Failed to start API server', { error: (err as Error).message });
  process.exit(1);
});
