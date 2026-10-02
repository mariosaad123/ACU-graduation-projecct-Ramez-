import {
  doctorOnboardingSchema,
  emailCodeSchema,
  studentOnboardingSchema,
  type DoctorOnboardingResponse,
  type MeResponse,
} from '@acu/shared';
import { eq } from 'drizzle-orm';
import { Router, type Request, type Response } from 'express';
import { users } from '../../db/schema';
import type { AppDependencies } from '../../http/dependencies';
import { HttpError } from '../../http/http-error';
import { authOf, requireAuth } from '../../http/middleware/require-auth';
import { withBody } from '../../http/middleware/validate';
import { rotateSession } from '../auth/sessions';
import { toSessionUser } from '../users/session-user';
import {
  completeStudentOnboarding,
  confirmDoctorEmailCode,
  resendDoctorEmailCode,
  startDoctorOnboarding,
  type OnboardingContext,
} from './onboarding.service';

export function createOnboardingRouter(deps: AppDependencies): Router {
  const { db, env, mailer, now } = deps;
  const router = Router();
  router.use(requireAuth);

  const contextFor = (req: Request): OnboardingContext => ({
    db,
    mailer,
    now,
    universityEmailDomain: env.UNIVERSITY_EMAIL_DOMAIN,
    ipAddress: req.ip,
  });

  /** After a role is granted the session is replaced, then the fresh account is returned. */
  const respondWithAccount = async (req: Request, res: Response) => {
    const userId = authOf(req).user.id;
    await rotateSession(req, res, deps);
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) {
      throw new HttpError(401, 'UNAUTHENTICATED', 'Sign in to continue');
    }
    const body: MeResponse = { user: await toSessionUser(db, user) };
    res.json(body);
  };

  router.post(
    '/student',
    withBody(studentOnboardingSchema, async (req, res, body) => {
      await completeStudentOnboarding(contextFor(req), authOf(req).user, body);
      await respondWithAccount(req, res);
    }),
  );

  router.post(
    '/doctor',
    withBody(doctorOnboardingSchema, async (req, res, body) => {
      const result: DoctorOnboardingResponse = await startDoctorOnboarding(
        contextFor(req),
        authOf(req).user,
        body,
      );
      if (result.status === 'active') {
        await rotateSession(req, res, deps);
      }
      res.json(result);
    }),
  );

  router.post('/doctor/resend', async (req, res) => {
    const result: DoctorOnboardingResponse = await resendDoctorEmailCode(
      contextFor(req),
      authOf(req).user,
    );
    res.json(result);
  });

  router.post(
    '/doctor/verify',
    withBody(emailCodeSchema, async (req, res, body) => {
      await confirmDoctorEmailCode(contextFor(req), authOf(req).user, body.code);
      await respondWithAccount(req, res);
    }),
  );

  return router;
}
