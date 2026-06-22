// Auth router. Mounted at /api/auth by the app.
import { Router } from 'express';
import { validate } from '../../middleware/validate.middleware';
import { authenticate } from '../../middleware/auth.middleware';
import { authRateLimiter } from '../../middleware/rateLimit.middleware';
import { loginSchema, refreshSchema, logoutSchema } from './auth.schema';
import {
  loginHandler,
  refreshHandler,
  logoutHandler,
  meHandler,
} from './auth.controller';

const router = Router();

router.post('/login', authRateLimiter, validate({ body: loginSchema }), loginHandler);
router.post('/refresh', authRateLimiter, validate({ body: refreshSchema }), refreshHandler);
router.post('/logout', authenticate, validate({ body: logoutSchema }), logoutHandler);
router.get('/me', authenticate, meHandler);

export default router;
