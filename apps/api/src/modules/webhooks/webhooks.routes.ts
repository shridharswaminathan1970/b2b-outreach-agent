// Webhooks outbox router. Mounted at /api/webhooks. Read-only inspection of the
// outbound event queue; restricted to manager+ (operational/integration data).
import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import { listWebhooksSchema } from './webhooks.schema';
import { listWebhooksHandler } from './webhooks.controller';

const router = Router();

router.use(authenticate);
router.use(requireRole('super_admin', 'management_admin', 'sales_manager'));

router.get('/', validate({ query: listWebhooksSchema }), listWebhooksHandler);

export default router;
