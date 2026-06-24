// JWT authentication middleware. Verifies the access token from the
// Authorization header and attaches the decoded user to req.user.
import type { Request, RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { Errors } from '../utils/response';

// platform_owner is the cross-company "super duper admin" (the platform operator);
// the rest are company-scoped roles.
export type UserRole = 'platform_owner' | 'super_admin' | 'management_admin' | 'sales_manager' | 'sdr';

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  // Tenancy: every authenticated user belongs to a company; team-scoped roles
  // (sales_manager / sdr) also carry their team.
  companyId: string;
  teamId: string | null;
}

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: UserRole;
  companyId: string;
  teamId: string | null;
  type: 'access';
}

// Augment Express Request so downstream handlers see a typed req.user.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length).trim() || null;
}

export const authenticate: RequestHandler = (req, _res, next) => {
  const token = extractBearerToken(req);
  if (!token) {
    next(Errors.unauthorized('Missing or malformed Authorization header'));
    return;
  }
  try {
    const payload = jwt.verify(token, config.jwt.accessSecret) as AccessTokenPayload;
    if (payload.type !== 'access') {
      next(Errors.unauthorized('Invalid token type'));
      return;
    }
    req.user = {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      companyId: payload.companyId,
      teamId: payload.teamId ?? null,
    };
    next();
  } catch {
    next(Errors.unauthorized('Invalid or expired token'));
  }
};
