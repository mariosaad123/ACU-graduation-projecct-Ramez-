import { UNIVERSITY_EMAIL_DOMAIN } from '@acu/shared';
import { z } from 'zod';

const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value === '' ? undefined : value));

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    /** Public origin of the web app: used for CORS, CSRF checks and redirects after sign-in. */
    WEB_ORIGIN: z.url().default('http://localhost:5173'),
    /** Number of reverse proxies in front of the API, so client IPs are read correctly. */
    TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),

    DATABASE_URL: z
      .string()
      .regex(/^(postgres(ql)?:\/\/|pglite:)/, 'Use postgres://… or pglite:memory / pglite:<dir>')
      .default('pglite:.data/dev-db'),

    GOOGLE_CLIENT_ID: optionalText,
    GOOGLE_CLIENT_SECRET: optionalText,

    UNIVERSITY_EMAIL_DOMAIN: z.string().default(UNIVERSITY_EMAIL_DOMAIN),

    MAIL_TRANSPORT: z.enum(['console', 'smtp']).default('console'),
    SMTP_URL: optionalText,
    MAIL_FROM: z.string().default('ACU Languages <no-reply@localhost>'),

    /** Where uploaded photos and chat attachments are kept: a folder, or the database itself. */
    STORAGE_DRIVER: z.enum(['disk', 'database']).default('disk'),
    /** Folder for uploads when STORAGE_DRIVER is disk. */
    UPLOADS_DIR: z.string().default('.data/uploads'),
  })
  .superRefine((env, context) => {
    const fail = (key: string, message: string) => {
      context.addIssue({ code: 'custom', path: [key], message });
    };

    if (Boolean(env.GOOGLE_CLIENT_ID) !== Boolean(env.GOOGLE_CLIENT_SECRET)) {
      fail(
        'GOOGLE_CLIENT_SECRET',
        'Set both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, or neither',
      );
    }
    if (env.MAIL_TRANSPORT === 'smtp' && !env.SMTP_URL) {
      fail('SMTP_URL', 'SMTP_URL is required when MAIL_TRANSPORT is smtp');
    }
    if (env.NODE_ENV === 'production') {
      if (!env.GOOGLE_CLIENT_ID) {
        fail('GOOGLE_CLIENT_ID', 'Google sign-in must be configured in production');
      }
      if (env.MAIL_TRANSPORT !== 'smtp') {
        fail('MAIL_TRANSPORT', 'Production must send real email (smtp)');
      }
      if (env.DATABASE_URL.startsWith('pglite:')) {
        fail('DATABASE_URL', 'Production must use a PostgreSQL server');
      }
      if (!env.WEB_ORIGIN.startsWith('https://')) {
        fail('WEB_ORIGIN', 'Production must be served over HTTPS');
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  // Hosts such as Render choose the port and announce it as PORT.
  const result = envSchema.safeParse({ ...source, API_PORT: source.API_PORT ?? source.PORT });

  if (!result.success) {
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(result.error)}`);
  }

  return result.data;
}
