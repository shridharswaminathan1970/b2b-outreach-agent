// HTTP handlers for the per-company Prompt overrides module.
import type { Request, Response, NextFunction } from 'express';
import { sendSuccess, Errors } from '../../utils/response';
import { type Actor, toActor } from '../../utils/tenancy';
import * as promptsService from './prompts.service';
import type { ListPromptsInput, CreatePromptInput, UpdatePromptInput } from './prompts.schema';

function clientIp(req: Request): string | null {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim();
  return req.ip ?? null;
}

function actorFrom(req: Request): Actor {
  if (!req.user) throw Errors.unauthorized();
  return toActor(req.user, clientIp(req));
}

export async function listHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await promptsService.listPrompts(
      req.query as unknown as ListPromptsInput,
      actorFrom(req),
    );
    sendSuccess(res, result.items, 200, { pagination: result.pagination });
  } catch (err) {
    next(err);
  }
}

export async function getHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const prompt = await promptsService.getPromptById(req.params.id, actorFrom(req));
    sendSuccess(res, { prompt }, 200);
  } catch (err) {
    next(err);
  }
}

export async function createHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const prompt = await promptsService.createPrompt(req.body as CreatePromptInput, actorFrom(req));
    sendSuccess(res, { prompt }, 201);
  } catch (err) {
    next(err);
  }
}

export async function updateHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const prompt = await promptsService.updatePrompt(
      req.params.id,
      req.body as UpdatePromptInput,
      actorFrom(req),
    );
    sendSuccess(res, { prompt }, 200);
  } catch (err) {
    next(err);
  }
}

export async function deleteHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await promptsService.deletePrompt(req.params.id, actorFrom(req));
    sendSuccess(res, result, 200);
  } catch (err) {
    next(err);
  }
}
