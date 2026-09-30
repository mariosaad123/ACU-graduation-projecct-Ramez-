import path from 'node:path';
import { lt } from 'drizzle-orm';
import { loadEnv } from './config/env';
import { createDatabase } from './db/client';
import { authFlows } from './db/schema';
import { createApp } from './http/app';
import { createLogger } from './lib/logger';
import { createGoogleIdentityProvider } from './modules/auth/identity-provider';
import { deleteExpiredSessions } from './modules/auth/sessions';
import { DiskStorage } from './modules/files/storage';
import { createMailer } from './modules/mail/mailer';

const SHUTDOWN_TIMEOUT_MS = 10_000;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

const env = loadEnv();
const logger = createLogger(env);
const database = createDatabase(env.DATABASE_URL);

// Production applies migrations as a separate deploy step (pnpm db:migrate).
if (env.NODE_ENV !== 'production') {
  await database.migrate();
}

const identityProvider =
  env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
    ? createGoogleIdentityProvider(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET)
    : null;

if (!identityProvider) {
  logger.warn('Google sign-in is not configured: set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET');
}

const app = createApp({
  env,
  logger,
  db: database.db,
  identityProvider,
  mailer: createMailer(env, logger),
  storage: new DiskStorage(path.resolve(env.UPLOADS_DIR)),
  now: () => new Date(),
});

const cleanup = setInterval(() => {
  const now = new Date();
  Promise.all([
    deleteExpiredSessions(database.db, now),
    database.db.delete(authFlows).where(lt(authFlows.expiresAt, now)),
  ]).catch((error: unknown) => {
    logger.error({ err: error }, 'Housekeeping failed');
  });
}, CLEANUP_INTERVAL_MS);
cleanup.unref();

const server = app.listen(env.API_PORT, (error) => {
  if (error) {
    logger.fatal({ err: error }, 'Failed to start the API server');
    process.exit(1);
  }
  logger.info(`API listening on http://localhost:${env.API_PORT}`);
});

function shutdown(signal: NodeJS.Signals): void {
  logger.info({ signal }, 'Shutting down');
  clearInterval(cleanup);

  server.close((error) => {
    database
      .close()
      .catch((closeError: unknown) => {
        logger.error({ err: closeError }, 'Error while closing the database');
      })
      .finally(() => {
        process.exit(error ? 1 : 0);
      });
  });

  setTimeout(() => process.exit(1), SHUTDOWN_TIMEOUT_MS).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
