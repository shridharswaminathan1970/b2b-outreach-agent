// Templates router. Mounted at /api/templates. All routes require auth;
// deletion requires manager+.
import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { requireWrite } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  listTemplatesSchema,
  templateIdParamSchema,
  createTemplateSchema,
  updateTemplateSchema,
  previewTemplateSchema,
} from './templates.schema';
import {
  listTemplatesHandler,
  getTemplateHandler,
  createTemplateHandler,
  updateTemplateHandler,
  previewTemplateHandler,
  deleteTemplateHandler,
} from './templates.controller';

const router = Router();

router.use(authenticate);

router.get('/', validate({ query: listTemplatesSchema }), listTemplatesHandler);
router.get('/:id', validate({ params: templateIdParamSchema }), getTemplateHandler);
router.post('/', requireWrite, validate({ body: createTemplateSchema }), createTemplateHandler);
router.patch(
  '/:id',
  requireWrite,
  validate({ params: templateIdParamSchema, body: updateTemplateSchema }),
  updateTemplateHandler,
);
router.post(
  '/:id/preview',
  validate({ params: templateIdParamSchema, body: previewTemplateSchema }),
  previewTemplateHandler,
);
router.delete(
  '/:id',
  requireWrite,
  validate({ params: templateIdParamSchema }),
  deleteTemplateHandler,
);

export default router;
