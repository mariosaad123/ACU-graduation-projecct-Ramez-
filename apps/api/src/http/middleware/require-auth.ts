import type { UserRole } from '@acu/shared';
import type { Request, RequestHandler } from 'express';
import type { Session, User } from '../../db/schema';
import { HttpError } from '../http-error';

export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.auth) {
    next(new HttpError(401, 'UNAUTHENTICATED', 'Sign in to continue'));
    return;
  }
  next();
};

export function requireRole(...roles: UserRole[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) {
      next(new HttpError(401, 'UNAUTHENTICATED', 'Sign in to continue'));
      return;
    }
    const { role } = req.auth.user;
    if (!role || !roles.includes(role)) {
      next(new HttpError(403, 'FORBIDDEN', 'Your account cannot do this'));
      return;
    }
    next();
  };
}

/** For handlers behind `requireAuth`: the session is guaranteed to be there. */
export function authOf(req: Request): { user: User; session: Session } {
  if (!req.auth) {
    throw new HttpError(401, 'UNAUTHENTICATED', 'Sign in to continue');
  }
  return req.auth;
}
