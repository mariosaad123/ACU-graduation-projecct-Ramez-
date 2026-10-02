import type { RequestHandler } from 'express';
import { HttpError } from '../http-error';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function originOf(value: string | undefined): string | null {
  if (!value) {
    return null;
  }
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/**
 * CSRF protection for cookie-authenticated requests: anything that changes state must come from
 * the web app's own origin. Browsers always send Origin on cross-site POSTs, and it cannot be
 * forged from a page. This works alongside SameSite=Lax cookies.
 */
export function requireSameOrigin(webOrigin: string): RequestHandler {
  const allowed = new URL(webOrigin).origin;

  return (req, _res, next) => {
    if (SAFE_METHODS.has(req.method)) {
      next();
      return;
    }

    const origin = originOf(req.get('origin')) ?? originOf(req.get('referer'));
    if (origin !== allowed) {
      next(new HttpError(403, 'CSRF_REJECTED', 'Request did not come from the web app'));
      return;
    }
    next();
  };
}
