// HTTP handlers for the Webhooks outbox (read-only).
import type { Request, Response, NextFunction } from 'express';
import { sendSuccess, Errors } from '../../utils/response';
import { toActor } from '../../utils/tenancy';
import { listWebhooks } from './webhooks.service';
import type { ListWebhooksInput } from './webhooks.schema';

export async function listWebhooksHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw Errors.unauthorized();
    const params = req.query as unknown as ListWebhooksInput;
    const result = await listWebhooks(params, toActor(req.user));
    sendSuccess(res, result.items, 200, { pagination: result.pagination });
  } catch (err) {
    next(err);
  }
}
