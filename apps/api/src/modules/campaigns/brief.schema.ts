// Validation schemas for the Campaign Brief system: the structured Product Brief
// + Buyer Persona + Sequence Strategy that drives all AI email generation.
import { z } from 'zod';

export const CTA_TYPES = ['webinar', 'demo', 'case_study', 'free_trial'] as const;
export const SENIORITIES = ['C-Suite', 'VP', 'Director', 'Manager'] as const;

// --- Product Brief (campaign level) ---
const s = (max = 2000) => z.string().trim().min(1).max(max);

export const productBriefSchema = z.object({
  productName: s(200),
  productPurpose: s(),
  targetCustomer: s(),
  u1Unworkable: s(),
  u2Urgent: s(),
  u3Unavoidable: s(),
  u4Underserved: s(),
  positioningStatement: s(),
});

// --- Buyer Persona (per campaign; all optional) ---
export const buyerPersonaSchema = z.object({
  industry: z.string().trim().max(200).optional(),
  companySize: z.string().trim().max(100).optional(),
  economicBuyerName: z.string().trim().max(200).optional(),
  economicBuyerDesignation: z.string().trim().max(200).optional(),
  economicBuyerSeniority: z.enum(SENIORITIES).optional(),
  economicBuyerEmail: z.string().trim().email().max(320).optional(),
  coDecisionMakerName: z.string().trim().max(200).optional(),
  coDecisionMakerDesignation: z.string().trim().max(200).optional(),
  coDecisionMakerEmail: z.string().trim().email().max(320).optional(),
});

// A single CTA touch's configuration (type + type-specific fields).
export const ctaTouchSchema = z.object({
  ctaType: z.enum(CTA_TYPES),
  config: z.record(z.string(), z.unknown()).optional(),
});

// --- Sequence Strategy ---
export const strategySchema = z.object({
  totalTouchpoints: z.number().int().min(1).max(30),
  // 80% trust / 20% CTA by default; bounded so there's always room for both.
  trustRatio: z.number().min(0.5).max(0.95).default(0.8),
  // Ordered CTA configs applied to the CTA block (final 20%). Extra entries are
  // ignored; missing entries leave that CTA touch type-less (generic ask).
  ctaTouches: z.array(ctaTouchSchema).max(30).default([]),
});

// Create an entire campaign from a brief: Campaign + CampaignBrief + Sequence +
// auto-generated steps.
export const createFromBriefSchema = z.object({
  name: z.string().trim().min(1).max(200),
  objective: z.string().trim().max(500).optional(),
  persona: z.string().trim().max(500).optional(),
  productBrief: productBriefSchema,
  buyerPersona: buyerPersonaSchema.optional().default({}),
  strategy: strategySchema,
});

// Edit the brief in place (any subset). Strategy numbers can change but do NOT
// auto-rebuild the sequence — use the regenerate endpoint for that.
export const updateBriefSchema = productBriefSchema
  .partial()
  .merge(buyerPersonaSchema)
  .merge(
    z.object({
      totalTouchpoints: z.number().int().min(1).max(30).optional(),
      trustRatio: z.number().min(0.5).max(0.95).optional(),
    }),
  );

// Rebuild the sequence steps from the (optionally updated) strategy.
export const regenerateSequenceSchema = z.object({
  totalTouchpoints: z.number().int().min(1).max(30).optional(),
  trustRatio: z.number().min(0.5).max(0.95).optional(),
  ctaTouches: z.array(ctaTouchSchema).max(30).optional(),
});

export const campaignIdParamSchema = z.object({ id: z.string().uuid() });

export type ProductBriefInput = z.infer<typeof productBriefSchema>;
export type BuyerPersonaInput = z.infer<typeof buyerPersonaSchema>;
export type CtaTouchInput = z.infer<typeof ctaTouchSchema>;
export type StrategyInput = z.infer<typeof strategySchema>;
export type CreateFromBriefInput = z.infer<typeof createFromBriefSchema>;
export type UpdateBriefInput = z.infer<typeof updateBriefSchema>;
export type RegenerateSequenceInput = z.infer<typeof regenerateSequenceSchema>;
