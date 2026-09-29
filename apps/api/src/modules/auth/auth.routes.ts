import { eq } from 'drizzle-orm';
import { Router, type Request, type Response } from 'express';
import { authFlows, doctorProfiles, users, type User } from '../../db/schema';
import type { AppDependencies } from '../../http/dependencies';
import { readCookie } from '../../http/cookies';
import { authOf, requireAuth } from '../../http/middleware/require-auth';
import { sanitizeReturnTo } from '../../lib/return-to';
import { recordAudit } from '../audit/audit';
import { IdentityProviderError, type VerifiedIdentity } from './identity-provider';
import {
  clearSessionCookie,
  createSession,
  deleteSession,
  deleteUserSessions,
  setSessionCookie,
} from './sessions';

const FLOW_COOKIE = 'acu_oauth';
const FLOW_TTL_MS = 10 * 60 * 1000;
export const CALLBACK_PATH = '/api/auth/google/callback';

/** Reasons shown on the sign-in page after a failed attempt (translated by the web app). */
export type SignInFailure =
  'google_unavailable' | 'expired' | 'cancelled' | 'failed' | 'unverified_email' | 'disabled';

/** Where a person lands after signing in depends on how far their account setup got. */
export function landingPathFor(user: User, doctorPending: boolean, returnTo: string | null) {
  if (!user.role) {
    return doctorPending ? '/welcome/doctor' : '/welcome';
  }
  return returnTo ?? '/app';
}

export function createAuthRouter(deps: AppDependencies): Router {
  const { db, env, identityProvider, now } = deps;
  const router = Router();
  const redirectUri = new URL(CALLBACK_PATH, env.WEB_ORIGIN).toString();
  const secure = env.NODE_ENV === 'production';

  const toSignIn = (res: Response, reason: SignInFailure) => {
    res.redirect(303, new URL(`/sign-in?error=${reason}`, env.WEB_ORIGIN).toString());
  };

  router.get('/google/start', async (req, res) => {
    if (!identityProvider) {
      toSignIn(res, 'google_unavailable');
      return;
    }

    let request;
    try {
      request = await identityProvider.createAuthorizationRequest(redirectUri);
    } catch (error) {
      req.log.error({ err: error }, 'Could not start Google sign-in');
      toSignIn(res, 'google_unavailable');
      return;
    }

    const [flow] = await db
      .insert(authFlows)
      .values({
        state: request.state,
        nonce: request.nonce,
        codeVerifier: request.codeVerifier,
        returnTo: sanitizeReturnTo(req.query.returnTo),
        expiresAt: new Date(now().getTime() + FLOW_TTL_MS),
      })
      .returning({ id: authFlows.id });

    res.cookie(FLOW_COOKIE, flow?.id ?? '', {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/api/auth',
      maxAge: FLOW_TTL_MS,
    });
    res.redirect(303, request.url.toString());
  });

  router.get('/google/callback', async (req, res) => {
    const flowId = readCookie(req, FLOW_COOKIE);
    res.clearCookie(FLOW_COOKIE, { httpOnly: true, secure, sameSite: 'lax', path: '/api/auth' });

    if (!identityProvider) {
      toSignIn(res, 'google_unavailable');
      return;
    }
    if (!flowId || !/^[0-9a-f-]{36}$/.test(flowId)) {
      toSignIn(res, 'expired');
      return;
    }

    // Single use: the flow is removed whatever the outcome.
    const [flow] = await db.delete(authFlows).where(eq(authFlows.id, flowId)).returning();
    if (!flow || flow.expiresAt.getTime() <= now().getTime()) {
      toSignIn(res, 'expired');
      return;
    }
    if (typeof req.query.error === 'string') {
      toSignIn(res, 'cancelled');
      return;
    }

    let identity: VerifiedIdentity;
    try {
      identity = await identityProvider.completeAuthorization(
        new URL(req.originalUrl, env.WEB_ORIGIN),
        { state: flow.state, nonce: flow.nonce, codeVerifier: flow.codeVerifier },
      );
    } catch (error) {
      const unavailable = error instanceof IdentityProviderError && error.reason === 'unavailable';
      req.log.warn({ err: error }, 'Google sign-in could not be completed');
      toSignIn(res, unavailable ? 'google_unavailable' : 'failed');
      return;
    }

    if (!identity.emailVerified) {
      toSignIn(res, 'unverified_email');
      return;
    }

    const user = await upsertUser(identity);
    if (user.disabledAt) {
      toSignIn(res, 'disabled');
      return;
    }

    const { token, expiresAt } = await createSession(db, user.id, req.get('user-agent'), now());
    setSessionCookie(res, env, token, expiresAt);
    await recordAudit(db, {
      actorUserId: user.id,
      action: 'auth.signed_in',
      at: now(),
      ipAddress: req.ip,
    });

    const doctorPending = await hasPendingDoctorProfile(user.id);
    const target = landingPathFor(user, doctorPending, flow.returnTo);
    res.redirect(303, new URL(target, env.WEB_ORIGIN).toString());
  });

  router.post('/sign-out', async (req: Request, res: Response) => {
    if (req.auth) {
      await deleteSession(db, req.auth.session.id);
      await recordAudit(db, {
        at: now(),
        actorUserId: req.auth.user.id,
        action: 'auth.signed_out',
        ipAddress: req.ip,
      });
    }
    clearSessionCookie(res, env);
    res.status(204).end();
  });

  router.post('/sign-out-everywhere', requireAuth, async (req, res) => {
    const { user } = authOf(req);
    await deleteUserSessions(db, user.id);
    await recordAudit(db, {
      at: now(),
      actorUserId: user.id,
      action: 'auth.signed_out_everywhere',
      ipAddress: req.ip,
    });
    clearSessionCookie(res, env);
    res.status(204).end();
  });

  async function upsertUser(identity: VerifiedIdentity): Promise<User> {
    const profile = {
      email: identity.email,
      emailVerified: identity.emailVerified,
      name: identity.name,
      avatarUrl: identity.pictureUrl,
      lastSignInAt: now(),
      updatedAt: now(),
    };

    const [user] = await db
      .insert(users)
      .values({ googleSubject: identity.subject, ...profile })
      .onConflictDoUpdate({ target: users.googleSubject, set: profile })
      .returning();

    if (!user) {
      throw new Error('User upsert returned no row');
    }
    return user;
  }

  async function hasPendingDoctorProfile(userId: string): Promise<boolean> {
    const [profile] = await db
      .select({ status: doctorProfiles.status })
      .from(doctorProfiles)
      .where(eq(doctorProfiles.userId, userId));
    return profile?.status === 'pending_verification';
  }

  return router;
}
