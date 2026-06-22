// HTTP handlers for the Accounts module.
import type { Request, Response, NextFunction } from 'express';
import { sendSuccess, Errors } from '../../utils/response';
import { type Actor, toActor } from '../../utils/tenancy';
import * as accountsService from './accounts.service';
import type {
  ListAccountsInput,
  CreateAccountInput,
  UpdateAccountInput,
} from './accounts.schema';

function clientIp(req: Request): string | null {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim();
  return req.ip ?? null;
}

function actorFrom(req: Request): Actor {
  if (!req.user) throw Errors.unauthorized();
  return toActor(req.user, clientIp(req));
}

export async function listAccountsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const params = req.query as unknown as ListAccountsInput;
    const result = await accountsService.listAccounts(params, actorFrom(req));
    sendSuccess(res, result.items, 200, { pagination: result.pagination });
  } catch (err) {
    next(err);
  }
}

export async function getAccountHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const account = await accountsService.getAccountById(req.params.id, actorFrom(req));
    sendSuccess(res, { account }, 200);
  } catch (err) {
    next(err);
  }
}

export async function createAccountHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const input = req.body as CreateAccountInput;
    const account = await accountsService.createAccount(input, actorFrom(req));
    sendSuccess(res, { account }, 201);
  } catch (err) {
    next(err);
  }
}

export async function updateAccountHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const input = req.body as UpdateAccountInput;
    const account = await accountsService.updateAccount(
      req.params.id,
      input,
      actorFrom(req),
    );
    sendSuccess(res, { account }, 200);
  } catch (err) {
    next(err);
  }
}

export async function deleteAccountHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await accountsService.deleteAccount(req.params.id, actorFrom(req));
    sendSuccess(res, result, 200);
  } catch (err) {
    next(err);
  }
}
