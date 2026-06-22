// HTTP handlers for the Teams module.
import type { Request, Response, NextFunction } from 'express';
import { sendSuccess, Errors } from '../../utils/response';
import { type Actor, toActor } from '../../utils/tenancy';
import * as teamsService from './teams.service';
import type { ListTeamsInput, CreateTeamInput, UpdateTeamInput } from './teams.schema';

function clientIp(req: Request): string | null {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim();
  return req.ip ?? null;
}

function actorFrom(req: Request): Actor {
  if (!req.user) throw Errors.unauthorized();
  return toActor(req.user, clientIp(req));
}

export async function listTeamsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await teamsService.listTeams(req.query as unknown as ListTeamsInput, actorFrom(req));
    sendSuccess(res, result.items, 200, { pagination: result.pagination });
  } catch (err) {
    next(err);
  }
}

export async function getTeamHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const team = await teamsService.getTeamById(req.params.id, actorFrom(req));
    sendSuccess(res, { team }, 200);
  } catch (err) {
    next(err);
  }
}

export async function createTeamHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const team = await teamsService.createTeam(req.body as CreateTeamInput, actorFrom(req));
    sendSuccess(res, { team }, 201);
  } catch (err) {
    next(err);
  }
}

export async function updateTeamHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const team = await teamsService.updateTeam(req.params.id, req.body as UpdateTeamInput, actorFrom(req));
    sendSuccess(res, { team }, 200);
  } catch (err) {
    next(err);
  }
}

export async function deleteTeamHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await teamsService.deleteTeam(req.params.id, actorFrom(req));
    sendSuccess(res, result, 200);
  } catch (err) {
    next(err);
  }
}
