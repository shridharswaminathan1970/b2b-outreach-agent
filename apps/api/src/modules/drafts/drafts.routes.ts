// Drafts router. Mounted at /api/drafts. All routes require authentication.
import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  listDraftsSchema,
  draftIdParamSchema,
  generateDraftSchema,
  updateDraftSchema,
  rejectDraftSchema,
} from './drafts.schema';
import {
  generateDraftHandler,
  listDraftsHandler,
  getDraftHandler,
  updateDraftHandler,
  approveDraftHandler,
  rejectDraftHandler,
} from './drafts.controller';

const router = Router();

router.use(authenticate);

router.post('/generate', validate({ body: generateDraftSchema }), generateDraftHandler);
router.get('/', validate({ query: listDraftsSchema }), listDraftsHandler);
router.get('/:id', validate({ params: draftIdParamSchema }), getDraftHandler);
router.patch(
  '/:id',
  validate({ params: draftIdParamSchema, body: updateDraftSchema }),
  updateDraftHandler,
);
router.post(
  '/:id/approve',
  validate({ params: draftIdParamSchema }),
  approveDraftHandler,
);
router.post(
  '/:id/reject',
  validate({ params: draftIdParamSchema, body: rejectDraftSchema }),
  rejectDraftHandler,
);

export default router;
