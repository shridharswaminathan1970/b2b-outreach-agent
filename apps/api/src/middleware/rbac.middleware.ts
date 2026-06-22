// Role-based access control middleware. Use after `authenticate`. Data-write
// capability is NOT a simple linear rank (management_admin is senior but
// view-only, while sales_manager is junior but can write), so write/reassign are
// modeled as explicit capabilities rather than a rank threshold.
import type { RequestHandler } from 'express';
import { Errors } from '../utils/response';
import { canWrite, canReassign } from '../utils/tenancy';
import type { UserRole } from './auth.middleware';

// Allow only the explicitly listed roles.
export function requireRole(...allowed: UserRole[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) {
      next(Errors.unauthorized());
      return;
    }
    if (allowed.includes(req.user.role)) {
      next();
      return;
    }
    next(Errors.forbidden('Insufficient role for this action'));
  };
}

// Only the company owner role.
export const requireSuperAdmin: RequestHandler = requireRole('super_admin');

// Allow roles that may create/edit/delete records (super_admin, sales_manager).
export const requireWrite: RequestHandler = (req, _res, next) => {
  if (!req.user) {
    next(Errors.unauthorized());
    return;
  }
  if (canWrite(req.user.role)) {
    next();
    return;
  }
  next(Errors.forbidden('Your role is view-only for this resource'));
};

// Allow roles that may reassign leads/campaigns (super_admin, sales_manager, sdr).
export const requireReassign: RequestHandler = (req, _res, next) => {
  if (!req.user) {
    next(Errors.unauthorized());
    return;
  }
  if (canReassign(req.user.role)) {
    next();
    return;
  }
  next(Errors.forbidden('Your role may not reassign records'));
};
