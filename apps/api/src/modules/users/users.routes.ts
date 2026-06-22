// Users router. Mounted at /api/users. All routes require authentication.
// Reads are tenant-scoped (any authenticated role sees their company/team).
// Writes are gated to writer roles (super_admin / sales_manager); the service
// additionally enforces hierarchy (you may only manage your own subordinates).
import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { requireWrite } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  listUsersSchema,
  userIdParamSchema,
  createUserSchema,
  updateUserSchema,
  changeRoleSchema,
  transferUserSchema,
} from './users.schema';
import {
  listUsersHandler,
  getUserHandler,
  createUserHandler,
  updateUserHandler,
  deleteUserHandler,
  changeRoleHandler,
  transferUserHandler,
} from './users.controller';

const router = Router();

router.use(authenticate);

router.get('/', validate({ query: listUsersSchema }), listUsersHandler);
router.get('/:id', validate({ params: userIdParamSchema }), getUserHandler);

router.post('/', requireWrite, validate({ body: createUserSchema }), createUserHandler);
router.patch(
  '/:id',
  requireWrite,
  validate({ params: userIdParamSchema, body: updateUserSchema }),
  updateUserHandler,
);
router.post(
  '/:id/role',
  requireWrite,
  validate({ params: userIdParamSchema, body: changeRoleSchema }),
  changeRoleHandler,
);
router.post(
  '/:id/transfer',
  requireWrite,
  validate({ params: userIdParamSchema, body: transferUserSchema }),
  transferUserHandler,
);
router.delete(
  '/:id',
  requireWrite,
  validate({ params: userIdParamSchema }),
  deleteUserHandler,
);

export default router;
