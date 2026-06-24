// Companies router. Mounted at /api/companies. A user can read their own company
// and (super_admin) change its settings/billing. The platform_owner ("super duper
// admin") additionally gets full cross-company CRUD.
import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { requireSuperAdmin, requirePlatformOwner } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  updateCompanySchema,
  listCompaniesSchema,
  createCompanySchema,
  companyIdParamSchema,
} from './companies.schema';
import {
  getMyCompanyHandler,
  updateMyCompanyHandler,
  listCompaniesHandler,
  getCompanyHandler,
  createCompanyHandler,
  updateCompanyHandler,
  deleteCompanyHandler,
} from './companies.controller';

const router = Router();

router.use(authenticate);

// Own tenant (any authenticated user; settings edit = super_admin).
router.get('/me', getMyCompanyHandler);
router.patch('/me', requireSuperAdmin, validate({ body: updateCompanySchema }), updateMyCompanyHandler);

// Cross-company management — platform_owner only.
router.get('/', requirePlatformOwner, validate({ query: listCompaniesSchema }), listCompaniesHandler);
router.post('/', requirePlatformOwner, validate({ body: createCompanySchema }), createCompanyHandler);
router.get('/:id', requirePlatformOwner, validate({ params: companyIdParamSchema }), getCompanyHandler);
router.patch(
  '/:id',
  requirePlatformOwner,
  validate({ params: companyIdParamSchema, body: updateCompanySchema }),
  updateCompanyHandler,
);
router.delete('/:id', requirePlatformOwner, validate({ params: companyIdParamSchema }), deleteCompanyHandler);

export default router;
