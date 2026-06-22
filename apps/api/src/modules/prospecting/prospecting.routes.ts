// Prospecting router. Mounted at /api/prospecting. Search is available to any
// authenticated user; importing prospects into contacts requires a writer role.
import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { requireWrite } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import { searchProspectsSchema, importProspectsSchema } from './prospecting.schema';
import { searchHandler, importHandler } from './prospecting.controller';

const router = Router();

router.use(authenticate);

router.post('/search', validate({ body: searchProspectsSchema }), searchHandler);
router.post('/import', requireWrite, validate({ body: importProspectsSchema }), importHandler);

export default router;
