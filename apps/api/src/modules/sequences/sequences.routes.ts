// Sequences router. Mounted at /api/sequences. All routes require auth;
// deletion requires manager+.
import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { requireWrite } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  listSequencesSchema,
  sequenceIdParamSchema,
  createSequenceSchema,
  updateSequenceSchema,
  replaceStepsSchema,
  enrollAudienceSchema,
} from './sequences.schema';
import {
  listSequencesHandler,
  getSequenceHandler,
  createSequenceHandler,
  updateSequenceHandler,
  replaceStepsHandler,
  enrollAudienceHandler,
  deleteSequenceHandler,
} from './sequences.controller';

const router = Router();

router.use(authenticate);

router.get('/', validate({ query: listSequencesSchema }), listSequencesHandler);
router.get('/:id', validate({ params: sequenceIdParamSchema }), getSequenceHandler);
router.post('/', validate({ body: createSequenceSchema }), createSequenceHandler);
router.patch(
  '/:id',
  validate({ params: sequenceIdParamSchema, body: updateSequenceSchema }),
  updateSequenceHandler,
);
router.put(
  '/:id/steps',
  validate({ params: sequenceIdParamSchema, body: replaceStepsSchema }),
  replaceStepsHandler,
);
router.post(
  '/:id/enroll',
  requireWrite,
  validate({ params: sequenceIdParamSchema, body: enrollAudienceSchema }),
  enrollAudienceHandler,
);
router.delete(
  '/:id',
  requireWrite,
  validate({ params: sequenceIdParamSchema }),
  deleteSequenceHandler,
);

export default router;
