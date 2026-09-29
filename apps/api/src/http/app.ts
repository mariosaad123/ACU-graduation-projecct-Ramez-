import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { APP_VERSION } from '../config/app-info';
import type { Env } from '../config/env';
import type { Logger } from '../lib/logger';
import { createHealthRouter } from '../modules/health/health.routes';
import { errorHandler } from './middleware/error-handler';
import { notFound } from './middleware/not-found';
import { requestLogger } from './middleware/request-logger';

export interface AppDependencies {
  env: Pick<Env, 'CORS_ORIGIN'>;
  logger: Logger;
}

export function createApp({ env, logger }: AppDependencies): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(requestLogger(logger));
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
  app.use(express.json({ limit: '100kb' }));

  app.use('/api/health', createHealthRouter(APP_VERSION));

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
