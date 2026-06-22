// HTTP handlers for the Templates module.
import type { Request, Response, NextFunction } from 'express';
import { sendSuccess, Errors } from '../../utils/response';
import { type Actor, toActor } from '../../utils/tenancy';
import * as templatesService from './templates.service';
import type {
  ListTemplatesInput,
  CreateTemplateInput,
  UpdateTemplateInput,
  PreviewTemplateInput,
} from './templates.schema';

function clientIp(req: Request): string | null {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim();
  return req.ip ?? null;
}

function actorFrom(req: Request): Actor {
  if (!req.user) throw Errors.unauthorized();
  return toActor(req.user, clientIp(req));
}

export async function listTemplatesHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const params = req.query as unknown as ListTemplatesInput;
    const result = await templatesService.listTemplates(params, actorFrom(req));
    sendSuccess(res, result.items, 200, { pagination: result.pagination });
  } catch (err) {
    next(err);
  }
}

export async function getTemplateHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const template = await templatesService.getTemplateById(req.params.id, actorFrom(req));
    sendSuccess(res, { template }, 200);
  } catch (err) {
    next(err);
  }
}

export async function createTemplateHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const template = await templatesService.createTemplate(
      req.body as CreateTemplateInput,
      actorFrom(req),
    );
    sendSuccess(res, { template }, 201);
  } catch (err) {
    next(err);
  }
}

export async function updateTemplateHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const template = await templatesService.updateTemplate(
      req.params.id,
      req.body as UpdateTemplateInput,
      actorFrom(req),
    );
    sendSuccess(res, { template }, 200);
  } catch (err) {
    next(err);
  }
}

export async function previewTemplateHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await templatesService.previewTemplate(
      req.params.id,
      req.body as PreviewTemplateInput,
      actorFrom(req),
    );
    sendSuccess(res, result, 200);
  } catch (err) {
    next(err);
  }
}

export async function deleteTemplateHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await templatesService.deleteTemplate(req.params.id, actorFrom(req));
    sendSuccess(res, result, 200);
  } catch (err) {
    next(err);
  }
}
