// HTTP handlers for the Users module. Inputs are already validated by the
// validate() middleware, so req.body/params/query are typed and safe here.
import type { Request, Response, NextFunction } from 'express';
import { sendSuccess, Errors } from '../../utils/response';
import { type Actor, toActor } from '../../utils/tenancy';
import * as usersService from './users.service';
import type {
  ListUsersInput,
  CreateUserInput,
  UpdateUserInput,
  ChangeRoleInput,
  TransferUserInput,
} from './users.schema';

function clientIp(req: Request): string | null {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim();
  return req.ip ?? null;
}

function actorFrom(req: Request): Actor {
  if (!req.user) throw Errors.unauthorized();
  return toActor(req.user, clientIp(req));
}

export async function listUsersHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const params = req.query as unknown as ListUsersInput;
    const result = await usersService.listUsers(params, actorFrom(req));
    sendSuccess(res, result.items, 200, { pagination: result.pagination });
  } catch (err) {
    next(err);
  }
}

export async function getUserHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = await usersService.getUserById(req.params.id, actorFrom(req));
    sendSuccess(res, { user }, 200);
  } catch (err) {
    next(err);
  }
}

export async function createUserHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const input = req.body as CreateUserInput;
    const user = await usersService.createUser(input, actorFrom(req));
    sendSuccess(res, { user }, 201);
  } catch (err) {
    next(err);
  }
}

export async function updateUserHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const input = req.body as UpdateUserInput;
    const user = await usersService.updateUser(req.params.id, input, actorFrom(req));
    sendSuccess(res, { user }, 200);
  } catch (err) {
    next(err);
  }
}

export async function deleteUserHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await usersService.deleteUser(req.params.id, actorFrom(req));
    sendSuccess(res, result, 200);
  } catch (err) {
    next(err);
  }
}

export async function changeRoleHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = await usersService.changeUserRole(
      req.params.id,
      req.body as ChangeRoleInput,
      actorFrom(req),
    );
    sendSuccess(res, { user }, 200);
  } catch (err) {
    next(err);
  }
}

export async function transferUserHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = await usersService.transferUser(
      req.params.id,
      req.body as TransferUserInput,
      actorFrom(req),
    );
    sendSuccess(res, { user }, 200);
  } catch (err) {
    next(err);
  }
}
