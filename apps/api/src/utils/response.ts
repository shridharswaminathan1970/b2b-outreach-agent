// Standard API response envelope used by every controller.
//   success: { success: true, data, meta? }
//   error:   { success: false, error: { code, message, details? } }
// Per CODE QUALITY RULES, clients never see raw stack traces.
import type { Response } from 'express';

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

// Thrown anywhere in the request lifecycle; caught by the global error handler,
// which translates it into the standard error envelope with the right status.
export class AppError extends Error {
  public readonly statusCode: number;

  public readonly code: string;

  public readonly details?: unknown;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

// Convenience constructors for the most common failure modes.
export const Errors = {
  badRequest: (message = 'Bad request', details?: unknown) =>
    new AppError(400, 'BAD_REQUEST', message, details),
  unauthorized: (message = 'Unauthorized') =>
    new AppError(401, 'UNAUTHORIZED', message),
  forbidden: (message = 'Forbidden') => new AppError(403, 'FORBIDDEN', message),
  notFound: (message = 'Not found') => new AppError(404, 'NOT_FOUND', message),
  conflict: (message = 'Conflict') => new AppError(409, 'CONFLICT', message),
  internal: (message = 'Internal server error') =>
    new AppError(500, 'INTERNAL_ERROR', message),
};

export function sendSuccess<T>(
  res: Response,
  data: T,
  statusCode = 200,
  meta?: Record<string, unknown>,
): Response {
  return res.status(statusCode).json({ success: true, data, ...(meta ? { meta } : {}) });
}

export function sendError(
  res: Response,
  statusCode: number,
  error: ApiErrorBody,
): Response {
  return res.status(statusCode).json({ success: false, error });
}
