import { eq, lt, or } from 'drizzle-orm';
import type { Request, RequestHandler, Response } from 'express';
import type { Env } from '../../config/env';
import type { Database } from '../../db/client';
import { sessions, users, type Session, type User } from '../../db/schema';
import { randomToken, sha256 } from '../../lib/crypto';
import { readCookie } from '../../http/cookies';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** A session ends after 14 days without use, and after 30 days in any case. */
export const SESSION_IDLE_TIMEOUT_MS = 14 * DAY_MS;
export const SESSION_MAX_AGE_MS = 30 * DAY_MS;
/** Recording every request would mean a write per request; once an hour is precise enough. */
const TOUCH_INTERVAL_MS = HOUR_MS;

export type Clock = () => Date;

/**
 * The `__Host-` prefix makes the browser refuse the cookie unless it is Secure, host-only and
 * scoped to `/`. It needs HTTPS, so development uses a plain name.
 */
export function sessionCookieName(env: Pick<Env, 'NODE_ENV'>): string {
  return env.NODE_ENV === 'production' ? '__Host-acu_session' : 'acu_session';
}

export async function createSession(
  db: Database,
  userId: string,
  userAgent: string | undefined,
  now: Date,
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomToken();
  const expiresAt = new Date(now.getTime() + SESSION_MAX_AGE_MS);

  await db.insert(sessions).values({
    userId,
    tokenHash: sha256(token),
    userAgent: userAgent?.slice(0, 300) ?? null,
    createdAt: now,
    lastSeenAt: now,
    expiresAt,
  });

  return { token, expiresAt };
}

function isExpired(session: Session, now: Date): boolean {
  return (
    session.expiresAt.getTime() <= now.getTime() ||
    session.lastSeenAt.getTime() + SESSION_IDLE_TIMEOUT_MS <= now.getTime()
  );
}

export async function findSession(
  db: Database,
  token: string,
  now: Date,
): Promise<{ session: Session; user: User } | null> {
  const [row] = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.tokenHash, sha256(token)));

  if (!row) {
    return null;
  }
  if (isExpired(row.session, now) || row.user.disabledAt) {
    await db.delete(sessions).where(eq(sessions.id, row.session.id));
    return null;
  }

  if (now.getTime() - row.session.lastSeenAt.getTime() >= TOUCH_INTERVAL_MS) {
    await db.update(sessions).set({ lastSeenAt: now }).where(eq(sessions.id, row.session.id));
  }

  return row;
}

export async function deleteSession(db: Database, sessionId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}

export async function deleteUserSessions(db: Database, userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

/** Housekeeping: removes sessions that can no longer be used. */
export async function deleteExpiredSessions(db: Database, now: Date): Promise<void> {
  await db
    .delete(sessions)
    .where(
      or(
        lt(sessions.expiresAt, now),
        lt(sessions.lastSeenAt, new Date(now.getTime() - SESSION_IDLE_TIMEOUT_MS)),
      ),
    );
}

export function setSessionCookie(
  res: Response,
  env: Pick<Env, 'NODE_ENV'>,
  token: string,
  expiresAt: Date,
): void {
  res.cookie(sessionCookieName(env), token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
}

export function clearSessionCookie(res: Response, env: Pick<Env, 'NODE_ENV'>): void {
  res.clearCookie(sessionCookieName(env), {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });
}

interface SessionDependencies {
  db: Database;
  env: Pick<Env, 'NODE_ENV'>;
  now: Clock;
}

/** Attaches `req.auth` when the request carries a live session; never rejects on its own. */
export function loadSession({ db, env, now }: SessionDependencies): RequestHandler {
  const cookieName = sessionCookieName(env);

  return async (req, res, next) => {
    const token = readCookie(req, cookieName);
    if (!token) {
      next();
      return;
    }

    const found = await findSession(db, token, now());
    if (found) {
      req.auth = found;
    } else {
      clearSessionCookie(res, env);
    }
    next();
  };
}

/**
 * Replaces the current session with a fresh one. Done whenever the account's privileges change,
 * so a token captured earlier cannot be used at the new privilege level.
 */
export async function rotateSession(
  req: Request,
  res: Response,
  { db, env, now }: SessionDependencies,
): Promise<void> {
  const current = req.auth;
  if (!current) {
    return;
  }
  await deleteSession(db, current.session.id);
  const { token, expiresAt } = await createSession(
    db,
    current.user.id,
    req.get('user-agent'),
    now(),
  );
  setSessionCookie(res, env, token, expiresAt);
}
