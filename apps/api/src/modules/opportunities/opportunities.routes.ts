// Opportunities router. Mounted at /api/opportunities. Reads are tenant-scoped;
// writes require a writer role; reassignment uses the reassign capability.
import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { requireWrite, requireReassign } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  listOpportunitiesSchema,
  opportunityIdParamSchema,
  createOpportunitySchema,
  updateOpportunitySchema,
  changeStageSchema,
  reassignOpportunitySchema,
  updateQualificationSchema,
} from './opportunities.schema';
import {
  listHandler,
  getHandler,
  createHandler,
  updateHandler,
  changeStageHandler,
  reassignHandler,
  deleteHandler,
  metaHandler,
  getQualificationHandler,
  updateQualificationHandler,
  reportHandler,
  recommendationsListHandler,
  recommendationHandler,
} from './opportunities.controller';

const router = Router();

router.use(authenticate);

// Static routes before /:id so they aren't captured as an id.
router.get('/meta', metaHandler);
router.get('/recommendations', recommendationsListHandler);

router.get('/', validate({ query: listOpportunitiesSchema }), listHandler);
router.get('/:id', validate({ params: opportunityIdParamSchema }), getHandler);
router.get(
  '/:id/qualification',
  validate({ params: opportunityIdParamSchema }),
  getQualificationHandler,
);
router.put(
  '/:id/qualification',
  requireWrite,
  validate({ params: opportunityIdParamSchema, body: updateQualificationSchema }),
  updateQualificationHandler,
);
router.get('/:id/report', validate({ params: opportunityIdParamSchema }), reportHandler);
router.get(
  '/:id/recommendation',
  validate({ params: opportunityIdParamSchema }),
  recommendationHandler,
);
router.post('/', requireWrite, validate({ body: createOpportunitySchema }), createHandler);
router.patch(
  '/:id',
  requireWrite,
  validate({ params: opportunityIdParamSchema, body: updateOpportunitySchema }),
  updateHandler,
);
router.post(
  '/:id/stage',
  requireWrite,
  validate({ params: opportunityIdParamSchema, body: changeStageSchema }),
  changeStageHandler,
);
router.post(
  '/:id/reassign',
  requireReassign,
  validate({ params: opportunityIdParamSchema, body: reassignOpportunitySchema }),
  reassignHandler,
);
router.delete(
  '/:id',
  requireWrite,
  validate({ params: opportunityIdParamSchema }),
  deleteHandler,
);

export default router;
