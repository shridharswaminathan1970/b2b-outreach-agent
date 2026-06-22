// Analytics router. Mounted at /api/analytics. All routes require authentication;
// metrics are visible to any authenticated role.
import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  overviewSchema,
  campaignMetricsSchema,
  campaignIdParamSchema,
  pipelineSchema,
} from './analytics.schema';
import {
  overviewHandler,
  campaignMetricsHandler,
  campaignDetailHandler,
  pipelineHandler,
} from './analytics.controller';

const router = Router();

router.use(authenticate);

router.get('/overview', validate({ query: overviewSchema }), overviewHandler);
router.get('/pipeline', validate({ query: pipelineSchema }), pipelineHandler);
router.get('/campaigns', validate({ query: campaignMetricsSchema }), campaignMetricsHandler);
router.get(
  '/campaigns/:id',
  validate({ params: campaignIdParamSchema, query: campaignMetricsSchema }),
  campaignDetailHandler,
);

export default router;
