// HTTP handlers for the Companies module (caller's own tenant).
import type { Request, Response, NextFunction } from 'express';
import { sendSuccess, Errors } from '../../utils/response';
import { type Actor, toActor } from '../../utils/tenancy';
import * as companiesService from './companies.service';
import type { UpdateCompanyInput } from './companies.schema';

function clientIp(req: Request): string | null {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim();
  return req.ip ?? null;
}

function actorFrom(req: Request): Actor {
  if (!req.user) throw Errors.unauthorized();
  return toActor(req.user, clientIp(req));
}

export async function getMyCompanyHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const company = await companiesService.getMyCompany(actorFrom(req));
    sendSuccess(res, { company }, 200);
  } catch (err) {
    next(err);
  }
}

export async function updateMyCompanyHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const company = await companiesService.updateMyCompany(req.body as UpdateCompanyInput, actorFrom(req));
    sendSuccess(res, { company }, 200);
  } catch (err) {
    next(err);
  }
}
