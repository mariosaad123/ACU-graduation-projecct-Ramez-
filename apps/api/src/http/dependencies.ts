import type { Env } from '../config/env';
import type { Database } from '../db/client';
import type { Logger } from '../lib/logger';
import type { IdentityProvider } from '../modules/auth/identity-provider';
import type { Clock } from '../modules/auth/sessions';
import type { FileStorage } from '../modules/files/storage';
import type { Mailer } from '../modules/mail/mailer';

export interface RateLimit {
  windowMs: number;
  limit: number;
}

export interface RateLimits {
  api: RateLimit;
  auth: RateLimit;
  onboarding: RateLimit;
}

const MINUTE_MS = 60 * 1000;

/** Per IP address. */
export const DEFAULT_RATE_LIMITS: RateLimits = {
  // An open chat asks for changes every few seconds, on top of everything else a page loads.
  api: { windowMs: 15 * MINUTE_MS, limit: 1200 },
  auth: { windowMs: 10 * MINUTE_MS, limit: 40 },
  onboarding: { windowMs: 10 * MINUTE_MS, limit: 40 },
};

/** Everything the HTTP layer needs from the outside, passed in so tests can swap any part. */
export interface AppDependencies {
  env: Env;
  logger: Logger;
  db: Database;
  /** Null when Google sign-in is not configured (local development without credentials). */
  identityProvider: IdentityProvider | null;
  mailer: Mailer;
  storage: FileStorage;
  now: Clock;
  rateLimits?: RateLimits;
}
