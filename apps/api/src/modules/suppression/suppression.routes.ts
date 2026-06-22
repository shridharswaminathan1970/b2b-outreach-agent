// Suppression router. Mounted at /api/suppression. All routes require
// authentication. Adding/checking is open to any authenticated role; removing
// an entry (manual re-subscribe) is restricted to manager+.
import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { requireWrite } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  addSuppressionSchema,
  listSuppressionsSchema,
  checkSuppressionSchema,
  removeSuppressionSchema,
} from './suppression.schema';
import {
  addSuppressionHandler,
  checkSuppressionHandler,
  listSuppressionsHandler,
  removeSuppressionHandler,
} from './suppression.controller';

const router = Router();

router.use(authenticate);

router.get('/', validate({ query: listSuppressionsSchema }), listSuppressionsHandler);
router.get('/check', validate({ query: checkSuppressionSchema }), checkSuppressionHandler);
router.post('/', validate({ body: addSuppressionSchema }), addSuppressionHandler);
router.delete(
  '/',
  requireWrite,
  validate({ body: removeSuppressionSchema }),
  removeSuppressionHandler,
);

export default router;
