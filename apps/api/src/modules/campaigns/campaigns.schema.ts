// Zod schemas for the Campaigns module.
import { z } from 'zod';

export const campaignStatusEnum = z.enum([
  'draft',
  'active',
  'paused',
  'completed',
  'archived',
]);

export const listCampaignsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().min(1).optional(),
  status: campaignStatusEnum.optional(),
});

export const campaignIdParamSchema = z.object({
  id: z.string().uuid('A valid campaign id is required'),
});

export const createCampaignSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
  objective: z.string().trim().max(2000).optional(),
  persona: z.string().trim().max(2000).optional(),
  icpRules: z.record(z.string(), z.unknown()).optional(),
  // External cross-reference (e.g. IGNITE-APEX CRM record).
  externalSource: z.string().trim().max(100).optional(),
  externalId: z.string().trim().max(200).optional(),
});

export const updateCampaignSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    objective: z.string().trim().max(2000).nullable().optional(),
    persona: z.string().trim().max(2000).nullable().optional(),
    icpRules: z.record(z.string(), z.unknown()).optional(),
    externalSource: z.string().trim().max(100).nullable().optional(),
    externalId: z.string().trim().max(200).nullable().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: 'At least one field must be provided',
  });

// Reassign a campaign to a different owning rep (manager+ only).
export const reassignCampaignSchema = z.object({
  ownerUserId: z.string().uuid('A valid ownerUserId is required'),
});

export type ListCampaignsInput = z.infer<typeof listCampaignsSchema>;
export type CampaignIdParam = z.infer<typeof campaignIdParamSchema>;
export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;
export type UpdateCampaignInput = z.infer<typeof updateCampaignSchema>;
export type ReassignCampaignInput = z.infer<typeof reassignCampaignSchema>;
