// HTTP handlers for the Suppression module.
import type { Request, Response, NextFunction } from 'express';
import { sendSuccess, Errors } from '../../utils/response';
import { type Actor, toActor } from '../../utils/tenancy';
import {
  addSuppression,
  isSuppressed,
  listSuppressions,
  removeSuppression,
} from './suppression.service';
import type {
  AddSuppressionInput,
  ListSuppressionsInput,
  CheckSuppressionInput,
  RemoveSuppressionInput,
} from './suppression.schema';

function clientIp(req: Request): string | null {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim();
  return req.ip ?? null;
}

function actorFrom(req: Request): Actor {
  if (!req.user) throw Errors.unauthorized();
  return toActor(req.user, clientIp(req));
}

export async function addSuppressionHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { email, reason, source } = req.body as AddSuppressionInput;
    const entry = await addSuppression(email, { reason, source, actor: actorFrom(req) });
    sendSuccess(res, { suppression: entry }, 201);
  } catch (err) {
    next(err);
  }
}

export async function checkSuppressionHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { email } = req.query as unknown as CheckSuppressionInput;
    const suppressed = await isSuppressed(email, actorFrom(req).companyId);
    sendSuccess(res, { email, suppressed }, 200);
  } catch (err) {
    next(err);
  }
}

export async function listSuppressionsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const params = req.query as unknown as ListSuppressionsInput;
    const result = await listSuppressions({ ...params, actor: actorFrom(req) });
    sendSuccess(res, result.items, 200, { pagination: result.pagination });
  } catch (err) {
    next(err);
  }
}

export async function removeSuppressionHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { email } = req.body as RemoveSuppressionInput;
    const result = await removeSuppression(email, actorFrom(req));
    sendSuccess(res, result, 200);
  } catch (err) {
    next(err);
  }
}
