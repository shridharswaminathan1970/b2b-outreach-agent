// Campaigns router. Mounted at /api/campaigns. All routes require auth; deletion
// requires manager+.
import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { requireWrite, requireReassign } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  listCampaignsSchema,
  campaignIdParamSchema,
  createCampaignSchema,
  updateCampaignSchema,
  reassignCampaignSchema,
} from './campaigns.schema';
import {
  listCampaignsHandler,
  getCampaignHandler,
  createCampaignHandler,
  updateCampaignHandler,
  activateCampaignHandler,
  pauseCampaignHandler,
  resumeCampaignHandler,
  completeCampaignHandler,
  archiveCampaignHandler,
  deleteCampaignHandler,
  reassignCampaignHandler,
} from './campaigns.controller';

const router = Router();

router.use(authenticate);

router.get('/', validate({ query: listCampaignsSchema }), listCampaignsHandler);
router.get('/:id', validate({ params: campaignIdParamSchema }), getCampaignHandler);
router.post('/', validate({ body: createCampaignSchema }), createCampaignHandler);
router.patch(
  '/:id',
  validate({ params: campaignIdParamSchema, body: updateCampaignSchema }),
  updateCampaignHandler,
);

// Status transitions.
router.post('/:id/activate', validate({ params: campaignIdParamSchema }), activateCampaignHandler);
router.post('/:id/pause', validate({ params: campaignIdParamSchema }), pauseCampaignHandler);
router.post('/:id/resume', validate({ params: campaignIdParamSchema }), resumeCampaignHandler);
router.post('/:id/complete', validate({ params: campaignIdParamSchema }), completeCampaignHandler);
router.post('/:id/archive', validate({ params: campaignIdParamSchema }), archiveCampaignHandler);

// Reassign ownership within scope (super_admin company-wide; sales_manager / sdr
// within their team).
router.post(
  '/:id/reassign',
  requireReassign,
  validate({ params: campaignIdParamSchema, body: reassignCampaignSchema }),
  reassignCampaignHandler,
);

router.delete(
  '/:id',
  requireWrite,
  validate({ params: campaignIdParamSchema }),
  deleteCampaignHandler,
);

export default router;
