// Zod schemas for the Webhooks (outbox) module — read-only listing.
import { z } from 'zod';

export const listWebhooksSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: z.enum(['pending', 'delivered', 'failed']).optional(),
  eventType: z.enum(['reply', 'bounce', 'conversion']).optional(),
});

export type ListWebhooksInput = z.infer<typeof listWebhooksSchema>;
