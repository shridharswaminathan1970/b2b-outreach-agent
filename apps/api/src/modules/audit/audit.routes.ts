// Audit router. Mounted at /api/audit. Audit logs are append-only and sensitive,
// so reading/exporting them requires manager+. (The writer is invoked internally
// by other modules, not exposed over HTTP.)
import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import { listAuditLogsSchema, exportAuditLogsSchema } from './audit.schema';
import { listAuditLogsHandler, exportAuditLogsHandler } from './audit.controller';

const router = Router();

router.use(authenticate);
router.use(requireRole('super_admin', 'management_admin', 'sales_manager'));

router.get('/', validate({ query: listAuditLogsSchema }), listAuditLogsHandler);
router.get('/export', validate({ query: exportAuditLogsSchema }), exportAuditLogsHandler);

export default router;
