// HTTP handlers for provisioning: the public signup request + the platform
// owner's console (list / approve / reject).
import type { Request, Response, NextFunction } from 'express';
import { sendSuccess, Errors } from '../../utils/response';
import { type Actor, toActor } from '../../utils/tenancy';
import * as provisioningService from './provisioning.service';
import type {
  CreateSignupRequestInput,
  ListSignupRequestsInput,
  RejectSignupRequestInput,
} from './provisioning.schema';

function clientIp(req: Request): string | null {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim();
  return req.ip ?? null;
}
function actorFrom(req: Request): Actor {
  if (!req.user) throw Errors.unauthorized();
  return toActor(req.user, clientIp(req));
}

// Public.
export async function createSignupRequestHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await provisioningService.createSignupRequest(req.body as CreateSignupRequestInput);
    sendSuccess(res, result, 201);
  } catch (err) {
    next(err);
  }
}

// platform_owner console.
export async function listSignupRequestsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const items = await provisioningService.listSignupRequests(req.query as unknown as ListSignupRequestsInput);
    sendSuccess(res, { items }, 200);
  } catch (err) {
    next(err);
  }
}

export async function approveSignupRequestHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await provisioningService.approveSignupRequest(req.params.id, actorFrom(req));
    sendSuccess(res, result, 200);
  } catch (err) {
    next(err);
  }
}

export async function rejectSignupRequestHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { notes } = req.body as RejectSignupRequestInput;
    const result = await provisioningService.rejectSignupRequest(req.params.id, actorFrom(req), notes);
    sendSuccess(res, result, 200);
  } catch (err) {
    next(err);
  }
}
