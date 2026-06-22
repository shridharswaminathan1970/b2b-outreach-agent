// HTTP handlers for the Drafts module.
import type { Request, Response, NextFunction } from 'express';
import { sendSuccess, Errors } from '../../utils/response';
import { type Actor, toActor } from '../../utils/tenancy';
import * as draftsService from './drafts.service';
import type {
  ListDraftsInput,
  GenerateDraftInput,
  UpdateDraftInput,
  RejectDraftInput,
} from './drafts.schema';

function clientIp(req: Request): string | null {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim();
  return req.ip ?? null;
}

function actorFrom(req: Request): Actor {
  if (!req.user) throw Errors.unauthorized();
  return toActor(req.user, clientIp(req));
}

export async function generateDraftHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const draft = await draftsService.generateDraft(
      req.body as GenerateDraftInput,
      actorFrom(req),
    );
    sendSuccess(res, { draft }, 201);
  } catch (err) {
    next(err);
  }
}

export async function listDraftsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const params = req.query as unknown as ListDraftsInput;
    const result = await draftsService.listDrafts(params, actorFrom(req));
    sendSuccess(res, result.items, 200, { pagination: result.pagination });
  } catch (err) {
    next(err);
  }
}

export async function getDraftHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const draft = await draftsService.getDraftById(req.params.id, actorFrom(req));
    sendSuccess(res, { draft }, 200);
  } catch (err) {
    next(err);
  }
}

export async function updateDraftHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const draft = await draftsService.updateDraft(
      req.params.id,
      req.body as UpdateDraftInput,
      actorFrom(req),
    );
    sendSuccess(res, { draft }, 200);
  } catch (err) {
    next(err);
  }
}

export async function approveDraftHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const draft = await draftsService.approveDraft(req.params.id, actorFrom(req));
    sendSuccess(res, { draft }, 200);
  } catch (err) {
    next(err);
  }
}

export async function rejectDraftHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { reason } = req.body as RejectDraftInput;
    const draft = await draftsService.rejectDraft(req.params.id, reason, actorFrom(req));
    sendSuccess(res, { draft }, 200);
  } catch (err) {
    next(err);
  }
}
