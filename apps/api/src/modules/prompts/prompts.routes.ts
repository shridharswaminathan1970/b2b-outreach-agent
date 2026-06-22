// Prompts router. Mounted at /api/prompts. Reads are company-scoped (manager+
// roles, since prompts are AI configuration); writes are SUPER_ADMIN-only.
import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { requireRole, requireSuperAdmin } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  listPromptsSchema,
  promptIdParamSchema,
  createPromptSchema,
  updatePromptSchema,
} from './prompts.schema';
import {
  listHandler,
  getHandler,
  createHandler,
  updateHandler,
  deleteHandler,
} from './prompts.controller';

const router = Router();

router.use(authenticate);
router.use(requireRole('super_admin', 'management_admin', 'sales_manager'));

router.get('/', validate({ query: listPromptsSchema }), listHandler);
router.get('/:id', validate({ params: promptIdParamSchema }), getHandler);
router.post('/', requireSuperAdmin, validate({ body: createPromptSchema }), createHandler);
router.patch(
  '/:id',
  requireSuperAdmin,
  validate({ params: promptIdParamSchema, body: updatePromptSchema }),
  updateHandler,
);
router.delete('/:id', requireSuperAdmin, validate({ params: promptIdParamSchema }), deleteHandler);

export default router;
