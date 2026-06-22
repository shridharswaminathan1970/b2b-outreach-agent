// Zod schemas for the Suppression module.
import { z } from 'zod';

// Add an email to the suppression list. reason/source are free-form labels
// (e.g. reason "unsubscribe" | "hard_bounce" | "manual", source "reply").
export const addSuppressionSchema = z.object({
  email: z.string().email('A valid email is required'),
  reason: z.string().max(200).optional(),
  source: z.string().max(100).optional(),
});

export const listSuppressionsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().max(200).optional(),
});

// Check whether an email is currently suppressed.
export const checkSuppressionSchema = z.object({
  email: z.string().email('A valid email is required'),
});

// Remove an email (manual re-subscribe). Restricted to manager+ in the router.
export const removeSuppressionSchema = z.object({
  email: z.string().email('A valid email is required'),
});

export type AddSuppressionInput = z.infer<typeof addSuppressionSchema>;
export type ListSuppressionsInput = z.infer<typeof listSuppressionsSchema>;
export type CheckSuppressionInput = z.infer<typeof checkSuppressionSchema>;
export type RemoveSuppressionInput = z.infer<typeof removeSuppressionSchema>;
