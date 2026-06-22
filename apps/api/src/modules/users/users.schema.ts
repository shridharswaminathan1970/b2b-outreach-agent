// Zod schemas for the Users module.
import { z } from 'zod';

export const userRoleEnum = z.enum([
  'super_admin',
  'management_admin',
  'sales_manager',
  'sdr',
]);
export const userStatusEnum = z.enum(['active', 'inactive', 'suspended']);

// GET /users — list with pagination + filters.
export const listUsersSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().min(1).optional(),
  role: userRoleEnum.optional(),
  status: userStatusEnum.optional(),
});

// :id path param shared by get/update/delete.
export const userIdParamSchema = z.object({
  id: z.string().uuid('A valid user id is required'),
});

// POST /users — create. teamId / reportsToUserId default from the creating actor.
export const createUserSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  email: z.string().email('A valid email is required').toLowerCase(),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
  role: userRoleEnum.default('sdr'),
  status: userStatusEnum.default('active'),
  teamId: z.string().uuid().nullable().optional(),
  reportsToUserId: z.string().uuid().nullable().optional(),
});

// POST /users/:id/role — promote/demote a subordinate.
export const changeRoleSchema = z.object({
  role: userRoleEnum,
});

// POST /users/:id/transfer — move a subordinate to another team (+ new manager).
export const transferUserSchema = z.object({
  teamId: z.string().uuid().nullable(),
  reportsToUserId: z.string().uuid().nullable().optional(),
});

// PATCH /users/:id — partial update. At least one field required.
export const updateUserSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    email: z.string().email().toLowerCase().optional(),
    password: z.string().min(8).max(200).optional(),
    role: userRoleEnum.optional(),
    status: userStatusEnum.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export type ListUsersInput = z.infer<typeof listUsersSchema>;
export type UserIdParam = z.infer<typeof userIdParamSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type ChangeRoleInput = z.infer<typeof changeRoleSchema>;
export type TransferUserInput = z.infer<typeof transferUserSchema>;
