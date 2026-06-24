// Provisioning router. Mounted at /api/provisioning.
//   POST /signup-requests              — PUBLIC (no auth): submit an eval request
//   GET  /signup-requests              — platform_owner: list requests (console)
//   POST /signup-requests/:id/approve  — platform_owner: provision company + admin
//   POST /signup-requests/:id/reject   — platform_owner
import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { requirePlatformOwner } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  createSignupRequestSchema,
  listSignupRequestsSchema,
  signupIdParamSchema,
  rejectSignupRequestSchema,
} from './provisioning.schema';
import {
  createSignupRequestHandler,
  listSignupRequestsHandler,
  approveSignupRequestHandler,
  rejectSignupRequestHandler,
} from './provisioning.controller';

const router = Router();

// Public submission.
router.post('/signup-requests', validate({ body: createSignupRequestSchema }), createSignupRequestHandler);

// Console — platform owner only.
router.get(
  '/signup-requests',
  authenticate,
  requirePlatformOwner,
  validate({ query: listSignupRequestsSchema }),
  listSignupRequestsHandler,
);
router.post(
  '/signup-requests/:id/approve',
  authenticate,
  requirePlatformOwner,
  validate({ params: signupIdParamSchema }),
  approveSignupRequestHandler,
);
router.post(
  '/signup-requests/:id/reject',
  authenticate,
  requirePlatformOwner,
  validate({ params: signupIdParamSchema, body: rejectSignupRequestSchema }),
  rejectSignupRequestHandler,
);

export default router;
