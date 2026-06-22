// HTTP handlers for the Campaigns module.
import type { Request, Response, NextFunction } from 'express';
import { sendSuccess, Errors } from '../../utils/response';
import { type Actor, toActor } from '../../utils/tenancy';
import * as campaignsService from './campaigns.service';
import type { CampaignAction } from './campaigns.service';
import type {
  ListCampaignsInput,
  CreateCampaignInput,
  UpdateCampaignInput,
  ReassignCampaignInput,
} from './campaigns.schema';

function clientIp(req: Request): string | null {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim();
  return req.ip ?? null;
}

function actorFrom(req: Request): Actor {
  if (!req.user) throw Errors.unauthorized();
  return toActor(req.user, clientIp(req));
}

export async function listCampaignsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const params = req.query as unknown as ListCampaignsInput;
    const result = await campaignsService.listCampaigns(params, actorFrom(req));
    sendSuccess(res, result.items, 200, { pagination: result.pagination });
  } catch (err) {
    next(err);
  }
}

export async function getCampaignHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const campaign = await campaignsService.getCampaignById(req.params.id, actorFrom(req));
    sendSuccess(res, { campaign }, 200);
  } catch (err) {
    next(err);
  }
}

export async function createCampaignHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const campaign = await campaignsService.createCampaign(
      req.body as CreateCampaignInput,
      actorFrom(req),
    );
    sendSuccess(res, { campaign }, 201);
  } catch (err) {
    next(err);
  }
}

export async function updateCampaignHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const campaign = await campaignsService.updateCampaign(
      req.params.id,
      req.body as UpdateCampaignInput,
      actorFrom(req),
    );
    sendSuccess(res, { campaign }, 200);
  } catch (err) {
    next(err);
  }
}

// Factory producing a handler for each status-transition action.
function transitionHandler(action: CampaignAction) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const campaign = await campaignsService.transitionCampaign(
        req.params.id,
        action,
        actorFrom(req),
      );
      sendSuccess(res, { campaign }, 200);
    } catch (err) {
      next(err);
    }
  };
}

export const activateCampaignHandler = transitionHandler('activate');
export const pauseCampaignHandler = transitionHandler('pause');
export const resumeCampaignHandler = transitionHandler('resume');
export const completeCampaignHandler = transitionHandler('complete');
export const archiveCampaignHandler = transitionHandler('archive');

export async function deleteCampaignHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await campaignsService.deleteCampaign(req.params.id, actorFrom(req));
    sendSuccess(res, result, 200);
  } catch (err) {
    next(err);
  }
}

export async function reassignCampaignHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { ownerUserId } = req.body as ReassignCampaignInput;
    const campaign = await campaignsService.reassignCampaign(
      req.params.id,
      ownerUserId,
      actorFrom(req),
    );
    sendSuccess(res, { campaign }, 200);
  } catch (err) {
    next(err);
  }
}
