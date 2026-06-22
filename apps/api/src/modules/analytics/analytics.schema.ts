// Zod schemas for the Analytics module (read-only aggregate metrics).
import { z } from 'zod';

// Optional time window applied to the underlying events (messages by sentAt,
// replies by receivedAt, tasks by createdAt). Omitted = all-time.
const timeWindow = {
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
};

export const overviewSchema = z.object({ ...timeWindow });

export const campaignMetricsSchema = z.object({
  ...timeWindow,
  // Cap how many campaigns the per-campaign breakdown returns.
  limit: z.coerce.number().int().positive().max(200).default(50),
});

export const campaignIdParamSchema = z.object({
  id: z.string().uuid('A valid campaign id is required'),
});

// Pipeline metrics, optionally filtered by salesperson + a created-at window.
export const pipelineSchema = z.object({
  ...timeWindow,
  ownerUserId: z.string().uuid().optional(),
});

export type PipelineInput = z.infer<typeof pipelineSchema>;

export type OverviewInput = z.infer<typeof overviewSchema>;
export type CampaignMetricsInput = z.infer<typeof campaignMetricsSchema>;
export type CampaignIdParam = z.infer<typeof campaignIdParamSchema>;
