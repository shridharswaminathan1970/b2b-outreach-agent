// HTTP handlers for the Sequences module.
import type { Request, Response, NextFunction } from 'express';
import { sendSuccess, Errors } from '../../utils/response';
import { type Actor, toActor } from '../../utils/tenancy';
import * as sequencesService from './sequences.service';
import type {
  ListSequencesInput,
  CreateSequenceInput,
  UpdateSequenceInput,
  ReplaceStepsInput,
  EnrollAudienceInput,
} from './sequences.schema';

function clientIp(req: Request): string | null {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim();
  return req.ip ?? null;
}

function actorFrom(req: Request): Actor {
  if (!req.user) throw Errors.unauthorized();
  return toActor(req.user, clientIp(req));
}

export async function listSequencesHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const params = req.query as unknown as ListSequencesInput;
    const result = await sequencesService.listSequences(params, actorFrom(req));
    sendSuccess(res, result.items, 200, { pagination: result.pagination });
  } catch (err) {
    next(err);
  }
}

export async function getSequenceHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const sequence = await sequencesService.getSequenceById(req.params.id, actorFrom(req));
    sendSuccess(res, { sequence }, 200);
  } catch (err) {
    next(err);
  }
}

export async function createSequenceHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const sequence = await sequencesService.createSequence(
      req.body as CreateSequenceInput,
      actorFrom(req),
    );
    sendSuccess(res, { sequence }, 201);
  } catch (err) {
    next(err);
  }
}

export async function updateSequenceHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const sequence = await sequencesService.updateSequence(
      req.params.id,
      req.body as UpdateSequenceInput,
      actorFrom(req),
    );
    sendSuccess(res, { sequence }, 200);
  } catch (err) {
    next(err);
  }
}

export async function replaceStepsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { steps } = req.body as ReplaceStepsInput;
    const sequence = await sequencesService.replaceSteps(
      req.params.id,
      steps,
      actorFrom(req),
    );
    sendSuccess(res, { sequence }, 200);
  } catch (err) {
    next(err);
  }
}

export async function enrollAudienceHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await sequencesService.enrollAudience(
      req.params.id,
      req.body as EnrollAudienceInput,
      actorFrom(req),
    );
    sendSuccess(res, result, 200);
  } catch (err) {
    next(err);
  }
}

export async function deleteSequenceHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await sequencesService.deleteSequence(req.params.id, actorFrom(req));
    sendSuccess(res, result, 200);
  } catch (err) {
    next(err);
  }
}
