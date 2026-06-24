// Zod schemas for the auth endpoints.
import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('A valid email is required'),
  password: z.string().min(1, 'Password is required'),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'refreshToken is required'),
});

export const logoutSchema = z.object({
  // Optional: when provided, only this refresh token is revoked; otherwise all
  // of the user's tokens are revoked.
  refreshToken: z.string().min(1).optional(),
});

// Password reset / set-password (provisioning + forgot-password).
export const resetTokenParamSchema = z.object({
  token: z.string().min(10, 'A valid token is required'),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(10, 'A valid token is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type LogoutInput = z.infer<typeof logoutSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
