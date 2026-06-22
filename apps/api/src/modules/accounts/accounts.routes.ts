// Accounts router. Mounted at /api/accounts. All routes require authentication;
// any authenticated role may read and create/update accounts, deletion requires
// manager+.
import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { requireWrite } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  listAccountsSchema,
  accountIdParamSchema,
  createAccountSchema,
  updateAccountSchema,
} from './accounts.schema';
import {
  listAccountsHandler,
  getAccountHandler,
  createAccountHandler,
  updateAccountHandler,
  deleteAccountHandler,
} from './accounts.controller';

const router = Router();

router.use(authenticate);

router.get('/', validate({ query: listAccountsSchema }), listAccountsHandler);
router.get('/:id', validate({ params: accountIdParamSchema }), getAccountHandler);
router.post('/', validate({ body: createAccountSchema }), createAccountHandler);
router.patch(
  '/:id',
  validate({ params: accountIdParamSchema, body: updateAccountSchema }),
  updateAccountHandler,
);
router.delete(
  '/:id',
  requireWrite,
  validate({ params: accountIdParamSchema }),
  deleteAccountHandler,
);

export default router;
