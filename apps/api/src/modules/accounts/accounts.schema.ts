// Zod schemas for the Accounts module (company records).
import { z } from 'zod';

export const listAccountsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().min(1).optional(),
  industry: z.string().trim().min(1).optional(),
  enriched: z.coerce.boolean().optional(),
  ownerUserId: z.string().uuid().optional(),
});

export const accountIdParamSchema = z.object({
  id: z.string().uuid('A valid account id is required'),
});

export const createAccountSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
  domain: z.string().trim().max(255).optional(),
  industry: z.string().trim().max(120).optional(),
  sizeBand: z.string().trim().max(50).optional(),
  country: z.string().trim().max(100).optional(),
  website: z.string().url('website must be a valid URL').optional(),
  linkedinUrl: z.string().url('linkedinUrl must be a valid URL').optional(),
  icpScore: z.coerce.number().int().min(0).max(100).optional(),
  ownerUserId: z.string().uuid().optional(),
  crmId: z.string().trim().max(255).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const updateAccountSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    domain: z.string().trim().max(255).nullable().optional(),
    industry: z.string().trim().max(120).nullable().optional(),
    sizeBand: z.string().trim().max(50).nullable().optional(),
    country: z.string().trim().max(100).nullable().optional(),
    website: z.string().url().nullable().optional(),
    linkedinUrl: z.string().url().nullable().optional(),
    icpScore: z.coerce.number().int().min(0).max(100).optional(),
    ownerUserId: z.string().uuid().nullable().optional(),
    crmId: z.string().trim().max(255).nullable().optional(),
    enriched: z.coerce.boolean().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export type ListAccountsInput = z.infer<typeof listAccountsSchema>;
export type AccountIdParam = z.infer<typeof accountIdParamSchema>;
export type CreateAccountInput = z.infer<typeof createAccountSchema>;
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;
