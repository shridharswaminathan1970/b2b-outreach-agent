// Zod schemas for the per-company Prompt overrides module.
import { z } from 'zod';

// Known AI purposes (kept in sync with the seeded global prompts). Free-form is
// allowed so companies can define custom purposes too.
export const promptPurposeEnum = z.string().trim().min(1).max(100);

export const listPromptsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
  purpose: promptPurposeEnum.optional(),
  // Also include the read-only platform-global defaults for reference.
  includeGlobal: z.coerce.boolean().optional(),
});

export const promptIdParamSchema = z.object({
  id: z.string().uuid('A valid prompt id is required'),
});

export const createPromptSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
  purpose: promptPurposeEnum,
  promptText: z.string().min(1, 'promptText is required').max(20000),
  modelName: z.string().trim().min(1).max(100),
  maxTokens: z.coerce.number().int().positive().max(20000),
  temperature: z.coerce.number().min(0).max(2).optional(),
  isActive: z.coerce.boolean().default(true),
});

export const updatePromptSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    promptText: z.string().min(1).max(20000).optional(),
    modelName: z.string().trim().min(1).max(100).optional(),
    maxTokens: z.coerce.number().int().positive().max(20000).optional(),
    temperature: z.coerce.number().min(0).max(2).nullable().optional(),
    isActive: z.coerce.boolean().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: 'At least one field must be provided',
  });

export type ListPromptsInput = z.infer<typeof listPromptsSchema>;
export type CreatePromptInput = z.infer<typeof createPromptSchema>;
export type UpdatePromptInput = z.infer<typeof updatePromptSchema>;
