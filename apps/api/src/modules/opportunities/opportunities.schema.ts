// Zod schemas for the Opportunities (pipeline) module. Stage values are
// validated against the *company's* sales framework in the service layer
// (see frameworks.ts), so here we accept any non-empty stage string.
import { z } from 'zod';
import { qualificationInputSchema } from './qualification';

// A stage id (e.g. 'new' / 'qualified' for general, 'ignite' / 'probe' for
// ignite_apex). The service rejects ids that aren't valid for the framework.
export const stageId = z.string().trim().min(1).max(40);

export const listOpportunitiesSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().min(1).optional(),
  stage: stageId.optional(),
  ownerUserId: z.string().uuid().optional(),
  // open=true → only open stages; open=false → only closed.
  open: z.coerce.boolean().optional(),
  verdict: z.string().trim().min(1).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const opportunityIdParamSchema = z.object({
  id: z.string().uuid('A valid opportunity id is required'),
});

export const createOpportunitySchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
  // Optional: defaults to the first stage of the company's framework.
  stage: stageId.optional(),
  amount: z.coerce.number().nonnegative().optional(),
  currency: z.string().trim().length(3).default('USD'),
  probability: z.coerce.number().int().min(0).max(100).optional(),
  expectedCloseDate: z.coerce.date().optional(),
  source: z.string().trim().max(100).optional(),
  ownerUserId: z.string().uuid().optional(),
  contactId: z.string().uuid().optional(),
  accountId: z.string().uuid().optional(),
  campaignId: z.string().uuid().optional(),
  externalSource: z.string().trim().max(100).optional(),
  externalId: z.string().trim().max(200).optional(),
});

export const updateOpportunitySchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    amount: z.coerce.number().nonnegative().nullable().optional(),
    currency: z.string().trim().length(3).optional(),
    probability: z.coerce.number().int().min(0).max(100).optional(),
    expectedCloseDate: z.coerce.date().nullable().optional(),
    source: z.string().trim().max(100).nullable().optional(),
    contactId: z.string().uuid().nullable().optional(),
    accountId: z.string().uuid().nullable().optional(),
    campaignId: z.string().uuid().nullable().optional(),
    externalSource: z.string().trim().max(100).nullable().optional(),
    externalId: z.string().trim().max(200).nullable().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: 'At least one field must be provided',
  });

// Move an opportunity to a new stage. closeReason is recorded for closed stages.
export const changeStageSchema = z.object({
  stage: stageId,
  closeReason: z.string().trim().max(500).optional(),
  // For ignite_apex: bypass a failed gate (manager override). Audit-logged.
  forceGate: z.coerce.boolean().optional(),
});

export const reassignOpportunitySchema = z.object({
  ownerUserId: z.string().uuid('A valid ownerUserId is required'),
});

// PUT /opportunities/:id/qualification — partial IGNITE-APEX deal record.
export const updateQualificationSchema = qualificationInputSchema;

export type ListOpportunitiesInput = z.infer<typeof listOpportunitiesSchema>;
export type OpportunityIdParam = z.infer<typeof opportunityIdParamSchema>;
export type CreateOpportunityInput = z.infer<typeof createOpportunitySchema>;
export type UpdateOpportunityInput = z.infer<typeof updateOpportunitySchema>;
export type ChangeStageInput = z.infer<typeof changeStageSchema>;
export type ReassignOpportunityInput = z.infer<typeof reassignOpportunitySchema>;
