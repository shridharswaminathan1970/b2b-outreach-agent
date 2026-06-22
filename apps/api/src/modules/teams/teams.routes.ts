// Teams router. Mounted at /api/teams. Reads are tenant-scoped; writes require a
// writer role (super_admin / sales_manager).
import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { requireWrite } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  listTeamsSchema,
  teamIdParamSchema,
  createTeamSchema,
  updateTeamSchema,
} from './teams.schema';
import {
  listTeamsHandler,
  getTeamHandler,
  createTeamHandler,
  updateTeamHandler,
  deleteTeamHandler,
} from './teams.controller';

const router = Router();

router.use(authenticate);

router.get('/', validate({ query: listTeamsSchema }), listTeamsHandler);
router.get('/:id', validate({ params: teamIdParamSchema }), getTeamHandler);
router.post('/', requireWrite, validate({ body: createTeamSchema }), createTeamHandler);
router.patch(
  '/:id',
  requireWrite,
  validate({ params: teamIdParamSchema, body: updateTeamSchema }),
  updateTeamHandler,
);
router.delete('/:id', requireWrite, validate({ params: teamIdParamSchema }), deleteTeamHandler);

export default router;
