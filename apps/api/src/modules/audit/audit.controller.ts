// HTTP handlers for the Audit module (read-only query + CSV export).
import type { Request, Response, NextFunction } from 'express';
import { sendSuccess, Errors } from '../../utils/response';
import { toActor } from '../../utils/tenancy';
import { listAuditLogs, exportAuditLogsCsv } from './audit.service';
import type { ListAuditLogsInput, ExportAuditLogsInput } from './audit.schema';

export async function listAuditLogsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw Errors.unauthorized();
    const params = req.query as unknown as ListAuditLogsInput;
    const result = await listAuditLogs(params, toActor(req.user));
    sendSuccess(res, result.items, 200, { pagination: result.pagination });
  } catch (err) {
    next(err);
  }
}

export async function exportAuditLogsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw Errors.unauthorized();
    const params = req.query as unknown as ExportAuditLogsInput;
    const csv = await exportAuditLogsCsv(params, toActor(req.user));
    const filename = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.status(200).send(csv);
  } catch (err) {
    next(err);
  }
}
