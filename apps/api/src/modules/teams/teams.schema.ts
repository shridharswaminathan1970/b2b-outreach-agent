// Zod schemas for the Teams module.
import { z } from 'zod';

export const listTeamsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
  search: z.string().trim().min(1).optional(),
  // Honored only for platform_owner (cross-company filter); ignored otherwise.
  companyId: z.string().uuid().optional(),
});

export const teamIdParamSchema = z.object({
  id: z.string().uuid('A valid team id is required'),
});

export const createTeamSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(150),
  department: z.string().trim().max(150).nullable().optional(),
  managerUserId: z.string().uuid().nullable().optional(),
  teamLeadUserId: z.string().uuid().nullable().optional(),
  // Required for platform_owner (which company to create the team in); ignored
  // for everyone else (they create in their own company).
  companyId: z.string().uuid().optional(),
});

export const updateTeamSchema = z
  .object({
    name: z.string().trim().min(1).max(150).optional(),
    department: z.string().trim().max(150).nullable().optional(),
    managerUserId: z.string().uuid().nullable().optional(),
    teamLeadUserId: z.string().uuid().nullable().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: 'At least one field must be provided',
  });

export type ListTeamsInput = z.infer<typeof listTeamsSchema>;
export type TeamIdParam = z.infer<typeof teamIdParamSchema>;
export type CreateTeamInput = z.infer<typeof createTeamSchema>;
export type UpdateTeamInput = z.infer<typeof updateTeamSchema>;
