// Zod schemas for the Replies module.
import { z } from 'zod';
import { stageId } from '../opportunities/opportunities.schema';

// The six classification categories (kept in sync with replies.classifier.ts).
export const replyClassificationEnum = z.enum([
  'interested',
  'objection',
  'out_of_office',
  'unsubscribe',
  'bounce',
  'unknown',
]);

// handle_action values (SCHEMA.sql: replies.handle_action).
export const handleActionEnum = z.enum([
  'created_task',
  'booked_meeting',
  'suppressed',
  'follow_up',
  'ignored',
]);

// task_type values (SCHEMA.sql: tasks.task_type).
export const taskTypeEnum = z.enum([
  'call',
  'linkedin_connect',
  'follow_up_email',
  'book_meeting',
  'review_reply',
]);

export const listRepliesSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  classification: replyClassificationEnum.optional(),
  needsHumanReview: z.coerce.boolean().optional(),
  handled: z.coerce.boolean().optional(),
  contactId: z.string().uuid().optional(),
  campaignId: z.string().uuid().optional(),
});

export const replyIdParamSchema = z.object({
  id: z.string().uuid('A valid reply id is required'),
});

// Ingest an inbound reply. messageId ties it to the original outbound message
// (and through it to the contact/campaign). The body is classified on ingest.
export const ingestReplySchema = z.object({
  messageId: z.string().uuid('A valid messageId is required'),
  rawBody: z.string().min(1, 'rawBody is required').max(50000),
  receivedAt: z.coerce.date().optional(),
});

// Force re-classification (e.g. after the AI classifier is wired up). Optionally
// override with a human-supplied classification.
export const classifyReplySchema = z
  .object({
    classification: replyClassificationEnum.optional(),
  })
  .default({});

// Optional deal details supplied when manually shaping the opportunity created
// from a conversion. Omitted fields fall back to sensible defaults.
export const conversionOpportunitySchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  amount: z.coerce.number().nonnegative().optional(),
  currency: z.string().trim().length(3).optional(),
  stage: stageId.optional(),
  probability: z.coerce.number().int().min(0).max(100).optional(),
  expectedCloseDate: z.coerce.date().optional(),
  ownerUserId: z.string().uuid().optional(),
});

// Route a reply: create a follow-up task, mark a meeting booked, suppress, etc.
// On a conversion (booked_meeting, or created_task with taskType book_meeting) an
// Opportunity is auto-created by default. Set createOpportunity:false to skip it
// (and create one manually later via /api/opportunities), or pass `opportunity`
// to customise the deal that gets created.
export const handleReplySchema = z
  .object({
    action: handleActionEnum,
    taskType: taskTypeEnum.optional(),
    ownerUserId: z.string().uuid().optional(),
    dueAt: z.coerce.date().optional(),
    notes: z.string().max(2000).optional(),
    createOpportunity: z.coerce.boolean().optional(),
    opportunity: conversionOpportunitySchema.optional(),
  })
  .refine(
    (d) => d.action !== 'created_task' || Boolean(d.taskType),
    { message: 'taskType is required when action is created_task', path: ['taskType'] },
  );

export type ListRepliesInput = z.infer<typeof listRepliesSchema>;
export type ReplyIdParam = z.infer<typeof replyIdParamSchema>;
export type IngestReplyInput = z.infer<typeof ingestReplySchema>;
export type ClassifyReplyInput = z.infer<typeof classifyReplySchema>;
export type HandleReplyInput = z.infer<typeof handleReplySchema>;
