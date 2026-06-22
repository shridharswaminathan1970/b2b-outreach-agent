// HTTP handlers for the Prospecting module.
import type { Request, Response, NextFunction } from 'express';
import { sendSuccess, Errors } from '../../utils/response';
import { type Actor, toActor } from '../../utils/tenancy';
import * as prospectingService from './prospecting.service';
import type { SearchProspectsInput, ImportProspectsInput } from './prospecting.schema';

function clientIp(req: Request): string | null {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim();
  return req.ip ?? null;
}

function actorFrom(req: Request): Actor {
  if (!req.user) throw Errors.unauthorized();
  return toActor(req.user, clientIp(req));
}

export async function searchHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await prospectingService.searchProspects(
      req.body as SearchProspectsInput,
      actorFrom(req),
    );
    sendSuccess(res, result, 200);
  } catch (err) {
    next(err);
  }
}

export async function importHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { people } = req.body as ImportProspectsInput;
    const summary = await prospectingService.importProspects(people, actorFrom(req));
    sendSuccess(res, summary, 200);
  } catch (err) {
    next(err);
  }
}
