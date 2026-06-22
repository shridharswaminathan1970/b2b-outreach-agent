// HTTP handlers for the Messages module.
import type { Request, Response, NextFunction } from 'express';
import { sendSuccess, Errors } from '../../utils/response';
import { type Actor, toActor } from '../../utils/tenancy';
import * as messagesService from './messages.service';
import type {
  ListMessagesInput,
  SendMessageInput,
  RecordEventInput,
} from './messages.schema';

function clientIp(req: Request): string | null {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim();
  return req.ip ?? null;
}

function actorFrom(req: Request): Actor {
  if (!req.user) throw Errors.unauthorized();
  return toActor(req.user, clientIp(req));
}

export async function sendMessageHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const message = await messagesService.sendMessage(
      req.body as SendMessageInput,
      actorFrom(req),
    );
    sendSuccess(res, { message }, 201);
  } catch (err) {
    next(err);
  }
}

export async function listMessagesHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const params = req.query as unknown as ListMessagesInput;
    const result = await messagesService.listMessages(params, actorFrom(req));
    sendSuccess(res, result.items, 200, { pagination: result.pagination });
  } catch (err) {
    next(err);
  }
}

export async function getMessageHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const message = await messagesService.getMessageById(req.params.id, actorFrom(req));
    sendSuccess(res, { message }, 200);
  } catch (err) {
    next(err);
  }
}

export async function getMessageStatusHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const status = await messagesService.getMessageStatus(req.params.id, actorFrom(req));
    sendSuccess(res, { status }, 200);
  } catch (err) {
    next(err);
  }
}

export async function recordEventHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const status = await messagesService.recordEvent(
      req.params.id,
      req.body as RecordEventInput,
      actorFrom(req),
    );
    sendSuccess(res, { status }, 201);
  } catch (err) {
    next(err);
  }
}
