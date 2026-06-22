// express-rate-limit configurations. A global limiter protects the whole API;
// a stricter limiter guards auth endpoints against brute-force attempts.
import rateLimit from 'express-rate-limit';
import { config } from '../config';
import { sendError } from '../utils/response';

const rateLimitHandler = (_req: unknown, res: Parameters<typeof sendError>[0]) =>
  sendError(res, 429, {
    code: 'RATE_LIMITED',
    message: 'Too many requests, please try again later',
  });

export const globalRateLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

// Tighter limit for login/refresh to slow credential stuffing.
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});
