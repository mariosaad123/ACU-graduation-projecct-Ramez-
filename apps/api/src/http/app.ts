import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { APP_VERSION } from '../config/app-info';
import { createAuthRouter } from '../modules/auth/auth.routes';
import { loadSession } from '../modules/auth/sessions';
import { createHealthRouter } from '../modules/health/health.routes';
import { createDoctorRouter } from '../modules/groups/doctor.routes';
import { createStudentGroupsRouter } from '../modules/groups/student-groups.routes';
import { createOnboardingRouter } from '../modules/onboarding/onboarding.routes';
import { createStudentLanguagesRouter } from '../modules/students/student-languages.routes';
import { createMeRouter } from '../modules/users/me.routes';
import { DEFAULT_RATE_LIMITS, type AppDependencies } from './dependencies';
import { errorHandler } from './middleware/error-handler';
import { notFound } from './middleware/not-found';
import { limitRequests } from './middleware/rate-limit';
import { requestLogger } from './middleware/request-logger';
import { requireSameOrigin } from './middleware/same-origin';

export function createApp(deps: AppDependencies): Express {
  const { env, logger } = deps;
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY);

  app.use(requestLogger(logger));
  app.use(helmet());
  app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }));
  app.use(express.json({ limit: '100kb' }));

  const limits = deps.rateLimits ?? DEFAULT_RATE_LIMITS;

  app.use('/api', limitRequests(limits.api));
  app.use('/api', requireSameOrigin(env.WEB_ORIGIN));
  app.use('/api', loadSession(deps));

  app.use('/api/health', createHealthRouter(APP_VERSION));
  app.use('/api/auth', limitRequests(limits.auth), createAuthRouter(deps));
  app.use('/api/me', createMeRouter(deps));
  app.use('/api/onboarding', limitRequests(limits.onboarding), createOnboardingRouter(deps));
  app.use('/api/student', createStudentLanguagesRouter(deps));
  app.use('/api/student', createStudentGroupsRouter(deps));
  app.use('/api/doctor', createDoctorRouter(deps));

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
