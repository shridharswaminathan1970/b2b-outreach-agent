// HTTP handlers for the auth endpoints. Validation has already run via the
// validate() middleware, so req.body is typed and safe here.
import type { Request, Response, NextFunction } from 'express';
import { sendSuccess, Errors } from '../../utils/response';
import * as authService from './auth.service';
import type { LoginInput, RefreshInput, LogoutInput } from './auth.schema';

function clientIp(req: Request): string | null {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim();
  return req.ip ?? null;
}

export async function loginHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { email, password } = req.body as LoginInput;
    const result = await authService.login(email, password, clientIp(req));
    sendSuccess(res, result, 200);
  } catch (err) {
    next(err);
  }
}

export async function refreshHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { refreshToken } = req.body as RefreshInput;
    const tokens = await authService.refresh(refreshToken);
    sendSuccess(res, tokens, 200);
  } catch (err) {
    next(err);
  }
}

export async function logoutHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw Errors.unauthorized();
    const { refreshToken } = req.body as LogoutInput;
    await authService.logout(req.user.id, refreshToken);
    sendSuccess(res, { loggedOut: true }, 200);
  } catch (err) {
    next(err);
  }
}

export async function meHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw Errors.unauthorized();
    const user = await authService.getCurrentUser(req.user.id);
    sendSuccess(res, { user }, 200);
  } catch (err) {
    next(err);
  }
}
