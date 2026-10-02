import { rateLimit } from 'express-rate-limit';
import type { RateLimit } from '../dependencies';
import { HttpError } from '../http-error';

/**
 * A limiter answering with our standard error body, per IP address or, with `perUser`, per
 * signed-in person (requests without a session pass through it). The in-memory store suits a
 * single API instance; a shared store (e.g. Redis) is needed before running several instances.
 */
export function limitRequests({ windowMs, limit }: RateLimit, perUser = false) {
  return rateLimit({
    windowMs,
    limit,
    ...(perUser && {
      skip: (req) => !req.auth,
      keyGenerator: (req) => `user:${req.auth?.user.id ?? ''}`,
    }),
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next, options) => {
      next(
        new HttpError(429, 'RATE_LIMITED', 'Too many requests, please slow down', {
          details: { retryAfterSeconds: Math.ceil(options.windowMs / 1000) },
        }),
      );
    },
  });
}
