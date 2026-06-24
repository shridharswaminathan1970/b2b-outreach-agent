// HTTP handlers for the Campaign Brief system.
import type { Request, Response, NextFunction } from 'express';
import { sendSuccess, Errors } from '../../utils/response';
import { type Actor, toActor } from '../../utils/tenancy';
import * as briefService from './brief.service';
import type {
  CreateFromBriefInput,
  UpdateBriefInput,
  RegenerateSequenceInput,
} from './brief.schema';

function clientIp(req: Request): string | null {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim();
  return req.ip ?? null;
}

function actorFrom(req: Request): Actor {
  if (!req.user) throw Errors.unauthorized();
  return toActor(req.user, clientIp(req));
}

export async function createFromBriefHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await briefService.createCampaignFromBrief(req.body as CreateFromBriefInput, actorFrom(req));
    sendSuccess(res, result, 201);
  } catch (err) {
    next(err);
  }
}

export async function getBriefHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await briefService.getBrief(req.params.id, actorFrom(req));
    sendSuccess(res, result, 200);
  } catch (err) {
    next(err);
  }
}

export async function updateBriefHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await briefService.updateBrief(req.params.id, req.body as UpdateBriefInput, actorFrom(req));
    sendSuccess(res, result, 200);
  } catch (err) {
    next(err);
  }
}

export async function regenerateSequenceHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await briefService.regenerateSequence(
      req.params.id,
      req.body as RegenerateSequenceInput,
      actorFrom(req),
    );
    sendSuccess(res, result, 200);
  } catch (err) {
    next(err);
  }
}
