// Companies router. Mounted at /api/companies. A user can read their own company;
// only SUPER_ADMIN can change company settings/billing.
import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { requireSuperAdmin } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import { updateCompanySchema } from './companies.schema';
import { getMyCompanyHandler, updateMyCompanyHandler } from './companies.controller';

const router = Router();

router.use(authenticate);

router.get('/me', getMyCompanyHandler);
router.patch('/me', requireSuperAdmin, validate({ body: updateCompanySchema }), updateMyCompanyHandler);

export default router;
