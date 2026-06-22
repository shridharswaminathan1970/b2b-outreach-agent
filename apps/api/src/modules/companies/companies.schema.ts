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

export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>;
