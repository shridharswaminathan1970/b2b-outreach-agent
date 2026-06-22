// HTTP handlers for the Opportunities (pipeline) module.
import type { Request, Response, NextFunction } from 'express';
import { sendSuccess, Errors } from '../../utils/response';
import { type Actor, toActor } from '../../utils/tenancy';
import * as oppService from './opportunities.service';
import { FRAMEWORKS, getFramework } from './frameworks';
import { CEMENT_LAYERS, ENTRY_POINTS, VERDICTS, VERDICT_LABEL } from './qualification';
import { prisma } from '@outreach/db';
import type {
  ListOpportunitiesInput,
  CreateOpportunityInput,
  UpdateOpportunityInput,
  ChangeStageInput,
  ReassignOpportunityInput,
} from './opportunities.schema';
import type { QualificationInput } from './qualification';

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
    const result = await oppService.listOpportunities(
      req.query as unknown as ListOpportunitiesInput,
      actorFrom(req),
    );
    sendSuccess(res, result.items, 200, { pagination: result.pagination });
  } catch (err) {
    next(err);
  }
}

export async function getHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const opportunity = await oppService.getOpportunityById(req.params.id, actorFrom(req));
    sendSuccess(res, { opportunity }, 200);
  } catch (err) {
    next(err);
  }
}

export async function createHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const opportunity = await oppService.createOpportunity(
      req.body as CreateOpportunityInput,
      actorFrom(req),
    );
    sendSuccess(res, { opportunity }, 201);
  } catch (err) {
    next(err);
  }
}

export async function updateHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const opportunity = await oppService.updateOpportunity(
      req.params.id,
      req.body as UpdateOpportunityInput,
      actorFrom(req),
    );
    sendSuccess(res, { opportunity }, 200);
  } catch (err) {
    next(err);
  }
}

export async function changeStageHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const opportunity = await oppService.changeStage(
      req.params.id,
      req.body as ChangeStageInput,
      actorFrom(req),
    );
    sendSuccess(res, { opportunity }, 200);
  } catch (err) {
    next(err);
  }
}

export async function reassignHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { ownerUserId } = req.body as ReassignOpportunityInput;
    const opportunity = await oppService.reassignOpportunity(req.params.id, ownerUserId, actorFrom(req));
    sendSuccess(res, { opportunity }, 200);
  } catch (err) {
    next(err);
  }
}

export async function deleteHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await oppService.deleteOpportunity(req.params.id, actorFrom(req));
    sendSuccess(res, result, 200);
  } catch (err) {
    next(err);
  }
}

// Framework metadata for the UI: all framework/stage definitions, the caller's
// active framework, plus the IGNITE-APEX CEMENT layers / entry points / verdicts.
export async function metaHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const actor = actorFrom(req);
    const company = await prisma.company.findUnique({
      where: { id: actor.companyId },
      select: { salesFramework: true },
    });
    const active = getFramework(company?.salesFramework).id;
    sendSuccess(
      res,
      {
        activeFramework: active,
        frameworks: Object.values(FRAMEWORKS),
        cementLayers: CEMENT_LAYERS,
        entryPoints: ENTRY_POINTS,
        verdicts: VERDICTS.map((v) => ({ id: v, label: VERDICT_LABEL[v] })),
      },
      200,
    );
  } catch (err) {
    next(err);
  }
}

export async function getQualificationHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await oppService.getQualification(req.params.id, actorFrom(req));
    sendSuccess(res, result, 200);
  } catch (err) {
    next(err);
  }
}

export async function updateQualificationHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await oppService.updateQualification(
      req.params.id,
      req.body as QualificationInput,
      actorFrom(req),
    );
    sendSuccess(res, result, 200);
  } catch (err) {
    next(err);
  }
}

export async function reportHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await oppService.getDealReport(req.params.id, actorFrom(req));
    sendSuccess(res, result, 200);
  } catch (err) {
    next(err);
  }
}

// Top open opportunities + their deterministic next-best-action (dashboard widget).
export async function recommendationsListHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const raw = Number((req.query.limit as string) ?? 5);
    const limit = Number.isFinite(raw) ? Math.min(20, Math.max(1, raw)) : 5;
    const result = await oppService.listOpportunityRecommendations(actorFrom(req), limit);
    sendSuccess(res, result, 200);
  } catch (err) {
    next(err);
  }
}

// Single deal next-best-action + AI script.
export async function recommendationHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await oppService.getOpportunityRecommendation(req.params.id, actorFrom(req));
    sendSuccess(res, result, 200);
  } catch (err) {
    next(err);
  }
}
