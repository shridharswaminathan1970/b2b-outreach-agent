// HTTP handlers for the Replies module.
import type { Request, Response, NextFunction } from 'express';
import { sendSuccess, Errors } from '../../utils/response';
import { type Actor, toActor } from '../../utils/tenancy';
import * as repliesService from './replies.service';
import type {
  ListRepliesInput,
  IngestReplyInput,
  ClassifyReplyInput,
  HandleReplyInput,
} from './replies.schema';

function clientIp(req: Request): string | null {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim();
  return req.ip ?? null;
}

function actorFrom(req: Request): Actor {
  if (!req.user) throw Errors.unauthorized();
  return toActor(req.user, clientIp(req));
}

export async function ingestReplyHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const reply = await repliesService.ingestReply(
      req.body as IngestReplyInput,
      actorFrom(req),
    );
    sendSuccess(res, { reply }, 201);
  } catch (err) {
    next(err);
  }
}

export async function listRepliesHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const params = req.query as unknown as ListRepliesInput;
    const result = await repliesService.listReplies(params, actorFrom(req));
    sendSuccess(res, result.items, 200, { pagination: result.pagination });
  } catch (err) {
    next(err);
  }
}

export async function getReplyHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const reply = await repliesService.getReplyById(req.params.id, actorFrom(req));
    sendSuccess(res, { reply }, 200);
  } catch (err) {
    next(err);
  }
}

export async function classifyReplyHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const reply = await repliesService.reclassifyReply(
      req.params.id,
      req.body as ClassifyReplyInput,
      actorFrom(req),
    );
    sendSuccess(res, { reply }, 200);
  } catch (err) {
    next(err);
  }
}

export async function handleReplyHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { reply, opportunity } = await repliesService.handleReply(
      req.params.id,
      req.body as HandleReplyInput,
      actorFrom(req),
    );
    sendSuccess(res, { reply, opportunity }, 200);
  } catch (err) {
    next(err);
  }
}
