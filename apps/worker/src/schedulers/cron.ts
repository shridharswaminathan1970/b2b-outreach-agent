// Recurring schedules, driven by pg-boss's built-in cron. The polling jobs
// (reply-check, followup) are scheduled here; pg-boss enqueues them on the cron
// cadence and the registered workers process them.
import { getBoss, QUEUES } from '../config/queues';
import { config } from '../config';
import { logger } from '../logger';

export async function registerSchedules(): Promise<void> {
  const boss = getBoss();

  // pg-boss schedule(name, cron, data, options). singletonKey-style dedup is
  // implicit per schedule name.
  await boss.schedule(QUEUES.replyCheck, config.cron.replyCheck, {}, {});
  await boss.schedule(QUEUES.followup, config.cron.followup, {}, {});

  logger.info('schedules registered', {
    replyCheck: config.cron.replyCheck,
    followup: config.cron.followup,
  });
}
