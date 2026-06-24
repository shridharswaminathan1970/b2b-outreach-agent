// Zod schemas for the Companies module (the caller's own tenant).
import { z } from 'zod';
import { SALES_FRAMEWORKS } from '@outreach/shared';

export const updateCompanySchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    domain: z.string().trim().max(255).nullable().optional(),
    // Generic product/market/ICP definition + company config.
    settings: z.record(z.string(), z.unknown()).optional(),
    // Sales methodology: "general" (default) or "ignite_apex".
    salesFramework: z.enum(SALES_FRAMEWORKS).optional(),
    billingPlan: z.string().trim().max(100).nullable().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: 'At least one field must be provided',
  });

// Platform-owner cross-company operations.
export const listCompaniesSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
  search: z.string().trim().min(1).optional(),
});

export const companyIdParamSchema = z.object({
  id: z.string().uuid('A valid company id is required'),
});

export const createCompanySchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
  domain: z.string().trim().max(255).nullable().optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
  salesFramework: z.enum(SALES_FRAMEWORKS).optional(),
  billingPlan: z.string().trim().max(100).nullable().optional(),
  status: z.enum(['active', 'suspended', 'inactive']).optional(),
});

export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>;
export type ListCompaniesInput = z.infer<typeof listCompaniesSchema>;
export type CreateCompanyInput = z.infer<typeof createCompanySchema>;
