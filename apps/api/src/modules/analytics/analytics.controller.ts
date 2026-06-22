// HTTP handlers for the Analytics module (read-only aggregate metrics).
import type { Request, Response, NextFunction } from 'express';
import { sendSuccess, Errors } from '../../utils/response';
import { type Actor, toActor } from '../../utils/tenancy';
import {
  getOverview,
  getCampaignMetrics,
  getCampaignDetail,
  getPipeline,
} from './analytics.service';
import type { OverviewInput, CampaignMetricsInput, PipelineInput } from './analytics.schema';

function clientIp(req: Request): string | null {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim();
  return req.ip ?? null;
}

function actorFrom(req: Request): Actor {
  if (!req.user) throw Errors.unauthorized();
  return toActor(req.user, clientIp(req));
}

export async function overviewHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const params = req.query as unknown as OverviewInput;
    const overview = await getOverview(params, actorFrom(req));
    sendSuccess(res, overview, 200);
  } catch (err) {
    next(err);
  }
}

export async function campaignMetricsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const params = req.query as unknown as CampaignMetricsInput;
    const rows = await getCampaignMetrics(params, actorFrom(req));
    sendSuccess(res, rows, 200);
  } catch (err) {
    next(err);
  }
}

export async function campaignDetailHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const params = req.query as unknown as CampaignMetricsInput;
    const detail = await getCampaignDetail(req.params.id, params, actorFrom(req));
    sendSuccess(res, detail, 200);
  } catch (err) {
    next(err);
  }
}

export async function pipelineHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const params = req.query as unknown as PipelineInput;
    const pipeline = await getPipeline(params, actorFrom(req));
    sendSuccess(res, pipeline, 200);
  } catch (err) {
    next(err);
  }
}
