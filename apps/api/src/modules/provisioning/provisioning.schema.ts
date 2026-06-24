// Zod schemas for the provisioning (signup request + console) endpoints.
import { z } from 'zod';

// Public signup/evaluation request. companyName is optional — when omitted it
// defaults to the user's full name (a solo signup).
export const createSignupRequestSchema = z.object({
  companyName: z.string().trim().max(200).optional(),
  fullName: z.string().trim().min(1, 'Your name is required').max(200),
  email: z.string().email('A valid email is required'),
  contactNumber: z.string().trim().max(40).optional(),
  addressLine1: z.string().trim().max(200).optional(),
  addressLine2: z.string().trim().max(200).optional(),
  city: z.string().trim().max(120).optional(),
  zip: z.string().trim().max(20).optional(),
  country: z.string().trim().max(100).optional(),
});

export const listSignupRequestsSchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
});

export const signupIdParamSchema = z.object({ id: z.string().uuid('A valid request id is required') });

export const rejectSignupRequestSchema = z.object({
  notes: z.string().trim().max(1000).optional(),
});

export type CreateSignupRequestInput = z.infer<typeof createSignupRequestSchema>;
export type ListSignupRequestsInput = z.infer<typeof listSignupRequestsSchema>;
export type RejectSignupRequestInput = z.infer<typeof rejectSignupRequestSchema>;
