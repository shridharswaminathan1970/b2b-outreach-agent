// Zod schemas for the Messages module.
import { z } from 'zod';

export const messageStatusEnum = z.enum([
  'pending',
  'sent',
  'delivered',
  'bounced',
  'failed',
  'suppressed',
]);

export const listMessagesSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: messageStatusEnum.optional(),
  direction: z.enum(['outbound', 'inbound']).optional(),
  campaignId: z.string().uuid().optional(),
  contactId: z.string().uuid().optional(),
});

export const messageIdParamSchema = z.object({
  id: z.string().uuid('A valid message id is required'),
});

// POST /messages/send — send an approved draft (preferred), or an ad-hoc message.
export const sendMessageSchema = z
  .object({
    draftId: z.string().uuid().optional(),
    contactId: z.string().uuid().optional(),
    campaignId: z.string().uuid().optional(),
    sequenceStepId: z.string().uuid().optional(),
    subject: z.string().max(500).optional(),
    body: z.string().max(20000).optional(),
    fromAddress: z.string().email().optional(),
  })
  .refine((d) => Boolean(d.draftId) || Boolean(d.contactId && d.campaignId && d.body), {
    message: 'Provide draftId, or contactId + campaignId + body for an ad-hoc send',
  });

// POST /messages/:id/events — record a deliverability/tracking event (simulates
// a provider webhook).
export const recordEventSchema = z.object({
  eventType: z.enum([
    'delivered',
    'open',
    'click',
    'bounce',
    'complaint',
    'unsubscribe',
  ]),
  bounceType: z.enum(['hard', 'soft']).optional(),
  providerEventId: z.string().max(255).optional(),
  eventAt: z.coerce.date().optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
});

export type ListMessagesInput = z.infer<typeof listMessagesSchema>;
export type MessageIdParam = z.infer<typeof messageIdParamSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type RecordEventInput = z.infer<typeof recordEventSchema>;
