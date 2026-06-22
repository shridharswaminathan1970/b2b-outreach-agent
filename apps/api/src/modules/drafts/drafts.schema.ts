// Zod schemas for the Drafts module.
import { z } from 'zod';

export const draftStatusEnum = z.enum([
  'pending_review',
  'approved',
  'rejected',
  'sent',
]);

export const listDraftsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: draftStatusEnum.optional(),
  campaignId: z.string().uuid().optional(),
  contactId: z.string().uuid().optional(),
});

export const draftIdParamSchema = z.object({
  id: z.string().uuid('A valid draft id is required'),
});

// POST /drafts/generate — produce a draft for a contact in a campaign. Content
// is sourced from a sequence step's template or an explicit templateId.
export const generateDraftSchema = z.object({
  contactId: z.string().uuid('A valid contactId is required'),
  campaignId: z.string().uuid('A valid campaignId is required'),
  sequenceStepId: z.string().uuid().optional(),
  templateId: z.string().uuid().optional(),
});

// PATCH /drafts/:id — edit content before approval.
export const updateDraftSchema = z
  .object({
    subject: z.string().max(500).nullable().optional(),
    body: z.string().max(20000).nullable().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: 'Provide subject and/or body to update',
  });

export const rejectDraftSchema = z.object({
  reason: z.string().trim().min(1, 'A rejection reason is required').max(1000),
});

export type ListDraftsInput = z.infer<typeof listDraftsSchema>;
export type DraftIdParam = z.infer<typeof draftIdParamSchema>;
export type GenerateDraftInput = z.infer<typeof generateDraftSchema>;
export type UpdateDraftInput = z.infer<typeof updateDraftSchema>;
export type RejectDraftInput = z.infer<typeof rejectDraftSchema>;
