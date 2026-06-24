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
  createFromBriefSchema,
  updateBriefSchema,
  regenerateSequenceSchema,
  campaignIdParamSchema as briefIdParamSchema,
} from './brief.schema';
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
import {
  createFromBriefHandler,
  getBriefHandler,
  updateBriefHandler,
  regenerateSequenceHandler,
} from './brief.controller';

const router = Router();

router.use(authenticate);

// Campaign Brief system — the structured create flow (Campaign + brief +
// auto-built sequence). Registered before /:id so /brief is not swallowed.
router.post('/brief', requireWrite, validate({ body: createFromBriefSchema }), createFromBriefHandler);
router.get('/:id/brief', validate({ params: briefIdParamSchema }), getBriefHandler);
router.put(
  '/:id/brief',
  requireWrite,
  validate({ params: briefIdParamSchema, body: updateBriefSchema }),
  updateBriefHandler,
);
router.post(
  '/:id/sequence/regenerate',
  requireWrite,
  validate({ params: briefIdParamSchema, body: regenerateSequenceSchema }),
  regenerateSequenceHandler,
);

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
