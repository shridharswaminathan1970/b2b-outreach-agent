// Zod schemas for the Sequences module (sequences + their ordered steps).
import { z } from 'zod';
import type { z as Z } from 'zod';

export const stepChannelEnum = z.enum(['email', 'linkedin', 'call', 'task']);
export const delayTypeEnum = z.enum(['business_hours', 'calendar_hours', 'immediate']);

// Demand-generation framework dimensions (see SequenceStep.intent / .branding):
//   intent   — "ops_intel" = operational intelligence, zero sales intent;
//              "soft_positioning" = light product positioning (touch 6+).
//   branding — "signature_only" = the vendor/product may appear only in the
//              email signature; "inline" = may appear in the body (touch 6+).
export const stepIntentEnum = z.enum(['ops_intel', 'soft_positioning']);
export const stepBrandingEnum = z.enum(['signature_only', 'inline']);

// The framework boundary: touches 1..N have zero sales intent and signature-only
// branding; soft positioning is allowed only from the next touch onward.
export const OPS_INTEL_TOUCHES = 5;

// A single step in a sequence. stepOrder is assigned by the server from array
// position, so callers do not provide it.
export const stepInputSchema = z.object({
  channel: stepChannelEnum.default('email'),
  delayHours: z.coerce.number().int().min(0).max(8760).default(0),
  delayType: delayTypeEnum.default('business_hours'),
  subject: z.string().trim().max(300).nullable().optional(),
  bodyOverride: z.string().max(20000).nullable().optional(),
  templateId: z.string().uuid().nullable().optional(),
  stopConditions: z.record(z.string(), z.unknown()).nullable().optional(),
  intent: stepIntentEnum.default('ops_intel'),
  branding: stepBrandingEnum.default('signature_only'),
});

// Enforce the demand-generation framework on an ordered step array: the first
// OPS_INTEL_TOUCHES touches must carry zero sales intent and signature-only
// branding. Soft positioning / inline branding is permitted only afterwards.
export function enforceDemandGenFramework(
  steps: Array<Z.infer<typeof stepInputSchema>>,
  ctx: Z.RefinementCtx,
): void {
  steps.forEach((step, i) => {
    const touch = i + 1;
    if (touch <= OPS_INTEL_TOUCHES) {
      if (step.intent !== 'ops_intel') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [i, 'intent'],
          message: `Touch ${touch} must deliver operational intelligence with zero sales intent (intent="ops_intel"); soft positioning may only start at touch ${OPS_INTEL_TOUCHES + 1}.`,
        });
      }
      if (step.branding !== 'signature_only') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [i, 'branding'],
          message: `Touch ${touch} may reference the vendor/product only in the signature (branding="signature_only") until touch ${OPS_INTEL_TOUCHES + 1}.`,
        });
      }
    }
  });
}

export const listSequencesSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  campaignId: z.string().uuid().optional(),
  status: z.string().trim().min(1).optional(),
});

export const sequenceIdParamSchema = z.object({
  id: z.string().uuid('A valid sequence id is required'),
});

export const createSequenceSchema = z
  .object({
    campaignId: z.string().uuid('A valid campaignId is required'),
    name: z.string().trim().min(1, 'Name is required').max(200),
    description: z.string().trim().max(2000).optional(),
    steps: z.array(stepInputSchema).max(50).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.steps) enforceDemandGenFramework(data.steps, ctx);
  });

export const updateSequenceSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    status: z.string().trim().min(1).max(50).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: 'At least one field must be provided',
  });

// PUT /sequences/:id/steps — replace the full ordered list of steps.
export const replaceStepsSchema = z
  .object({
    steps: z.array(stepInputSchema).max(50),
  })
  .superRefine((data, ctx) => enforceDemandGenFramework(data.steps, ctx));

// POST /sequences/:id/enroll — enroll an audience (the wizard's Audience + Schedule
// steps). startAt schedules the first touch; omit for "send as soon as due".
export const enrollAudienceSchema = z.object({
  contactIds: z.array(z.string().uuid()).min(1, 'Select at least one contact').max(2000),
  startAt: z.coerce.date().optional(),
});

export type StepInput = z.infer<typeof stepInputSchema>;
export type ListSequencesInput = z.infer<typeof listSequencesSchema>;
export type SequenceIdParam = z.infer<typeof sequenceIdParamSchema>;
export type CreateSequenceInput = z.infer<typeof createSequenceSchema>;
export type UpdateSequenceInput = z.infer<typeof updateSequenceSchema>;
export type ReplaceStepsInput = z.infer<typeof replaceStepsSchema>;
export type EnrollAudienceInput = z.infer<typeof enrollAudienceSchema>;
