// HTTP handlers for the Companies module (caller's own tenant).
import type { Request, Response, NextFunction } from 'express';
import { sendSuccess, Errors } from '../../utils/response';
import { type Actor, toActor } from '../../utils/tenancy';
import * as companiesService from './companies.service';
import type {
  UpdateCompanyInput,
  ListCompaniesInput,
  CreateCompanyInput,
} from './companies.schema';

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

// ── Platform-owner cross-company handlers ────────────────────────────────────
export async function listCompaniesHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await companiesService.listCompanies(req.query as unknown as ListCompaniesInput);
    sendSuccess(res, result.items, 200, { pagination: result.pagination });
  } catch (err) {
    next(err);
  }
}

export async function getCompanyHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const company = await companiesService.getCompanyById(req.params.id);
    sendSuccess(res, { company }, 200);
  } catch (err) {
    next(err);
  }
}

export async function createCompanyHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const company = await companiesService.createCompany(req.body as CreateCompanyInput, actorFrom(req));
    sendSuccess(res, { company }, 201);
  } catch (err) {
    next(err);
  }
}

export async function updateCompanyHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const company = await companiesService.updateCompanyById(
      req.params.id,
      req.body as UpdateCompanyInput,
      actorFrom(req),
    );
    sendSuccess(res, { company }, 200);
  } catch (err) {
    next(err);
  }
}

export async function deleteCompanyHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await companiesService.deleteCompany(req.params.id, actorFrom(req));
    sendSuccess(res, result, 200);
  } catch (err) {
    next(err);
  }
}
