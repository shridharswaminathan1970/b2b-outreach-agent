// Global error handler. Converts any thrown error into the standard error
// envelope. Known AppErrors map to their status/code; everything else becomes
// a 500 with no internal details leaked to the client.
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError, sendError } from '../utils/response';
import { logger } from '../utils/logger';

// 404 for unmatched routes.
export const notFoundHandler: RequestHandler = (req, res) => {
  sendError(res, 404, {
    code: 'NOT_FOUND',
    message: `Route ${req.method} ${req.path} not found`,
  });
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof AppError) {
    if (err.statusCode >= 500) logger.error(err.message, { code: err.code });
    return sendError(res, err.statusCode, {
      code: err.code,
      message: err.message,
      details: err.details,
    });
  }

  if (err instanceof ZodError) {
    return sendError(res, 400, {
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed',
      details: err.flatten(),
    });
  }

  // Unknown/unexpected error: log full detail server-side, return generic 500.
  logger.error('Unhandled error', {
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  return sendError(res, 500, {
    code: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred',
  });
};
