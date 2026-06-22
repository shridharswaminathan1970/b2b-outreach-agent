// Zod schemas for the Templates module.
import { z } from 'zod';

export const listTemplatesSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().min(1).optional(),
  persona: z.string().trim().min(1).optional(),
  campaignType: z.string().trim().min(1).optional(),
});

export const templateIdParamSchema = z.object({
  id: z.string().uuid('A valid template id is required'),
});

export const createTemplateSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
  subjectTemplate: z.string().max(500).optional(),
  bodyTemplate: z.string().max(20000).optional(),
  persona: z.string().trim().max(120).optional(),
  touchNumber: z.coerce.number().int().min(1).max(50).optional(),
  campaignType: z.string().trim().max(120).optional(),
});

export const updateTemplateSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    subjectTemplate: z.string().max(500).nullable().optional(),
    bodyTemplate: z.string().max(20000).nullable().optional(),
    persona: z.string().trim().max(120).nullable().optional(),
    touchNumber: z.coerce.number().int().min(1).max(50).nullable().optional(),
    campaignType: z.string().trim().max(120).nullable().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: 'At least one field must be provided',
  });

// POST /templates/:id/preview — render with sample data.
export const previewTemplateSchema = z.object({
  sampleData: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
});

export type ListTemplatesInput = z.infer<typeof listTemplatesSchema>;
export type TemplateIdParam = z.infer<typeof templateIdParamSchema>;
export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;
export type PreviewTemplateInput = z.infer<typeof previewTemplateSchema>;
