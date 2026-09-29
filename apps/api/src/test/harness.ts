import { pino } from 'pino';
import request from 'supertest';
import { loadEnv } from '../config/env';
import { createDatabase, type DatabaseConnection } from '../db/client';
import { doctorAccessCodes } from '../db/schema';
import { createApp } from '../http/app';
import type { RateLimits } from '../http/dependencies';
import { hashSecret } from '../lib/crypto';
import {
  IdentityProviderError,
  type IdentityProvider,
  type VerifiedIdentity,
} from '../modules/auth/identity-provider';
import type { MailMessage, Mailer } from '../modules/mail/mailer';

export const WEB_ORIGIN = 'http://localhost:5173';
export const DOCTOR_CODE = 'ACU-faculty-2026';

/** Stands in for Google: authorisation codes are mapped to identities by the test. */
export class FakeIdentityProvider implements IdentityProvider {
  private readonly identities = new Map<string, VerifiedIdentity>();
  lastState: string | null = null;

  willReturn(code: string, identity: VerifiedIdentity): void {
    this.identities.set(code, identity);
  }

  createAuthorizationRequest(redirectUri: string) {
    const state = `state-${Math.random().toString(36).slice(2)}`;
    this.lastState = state;
    const url = new URL('https://accounts.google.test/o/oauth2/v2/auth');
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('state', state);
    return Promise.resolve({ url, state, nonce: 'nonce', codeVerifier: 'verifier' });
  }

  completeAuthorization(callbackUrl: URL, checks: { state: string }) {
    if (callbackUrl.searchParams.get('state') !== checks.state) {
      return Promise.reject(new IdentityProviderError('rejected', 'state mismatch'));
    }
    const identity = this.identities.get(callbackUrl.searchParams.get('code') ?? '');
    if (!identity) {
      return Promise.reject(new IdentityProviderError('rejected', 'unknown code'));
    }
    return Promise.resolve(identity);
  }
}

export class MemoryMailer implements Mailer {
  readonly sent: MailMessage[] = [];
  failNext = false;

  send(message: MailMessage) {
    if (this.failNext) {
      this.failNext = false;
      return Promise.reject(new Error('SMTP unavailable'));
    }
    this.sent.push(message);
    return Promise.resolve();
  }

  /** The six-digit code from the most recent message. */
  lastCode(): string {
    const text = this.sent.at(-1)?.text ?? '';
    const match = /\b(\d{6})\b/.exec(text);
    if (!match?.[1]) {
      throw new Error('No code in the last email');
    }
    return match[1];
  }
}

export interface TestContext {
  app: ReturnType<typeof createApp>;
  database: DatabaseConnection;
  provider: FakeIdentityProvider;
  mailer: MemoryMailer;
  /** Moves the application clock forward. */
  advance: (ms: number) => void;
  close: () => Promise<void>;
}

/** Tests sign in many times from one address; the real limits have their own test. */
const GENEROUS_LIMITS: RateLimits = {
  api: { windowMs: 60_000, limit: 100_000 },
  auth: { windowMs: 60_000, limit: 100_000 },
  onboarding: { windowMs: 60_000, limit: 100_000 },
};

export async function createTestContext(
  options: {
    googleConfigured?: boolean;
    env?: Record<string, string>;
    rateLimits?: RateLimits;
  } = {},
): Promise<TestContext> {
  const env = loadEnv({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    DATABASE_URL: 'pglite:memory',
    WEB_ORIGIN,
    ...options.env,
  });
  const database = createDatabase(env.DATABASE_URL);
  await database.migrate();

  const provider = new FakeIdentityProvider();
  const mailer = new MemoryMailer();
  let current = new Date('2026-10-04T08:00:00.000Z');

  const app = createApp({
    env,
    logger: pino({ level: 'silent' }),
    db: database.db,
    identityProvider: options.googleConfigured === false ? null : provider,
    mailer,
    now: () => new Date(current),
    rateLimits: options.rateLimits ?? GENEROUS_LIMITS,
  });

  return {
    app,
    database,
    provider,
    mailer,
    advance: (ms) => {
      current = new Date(current.getTime() + ms);
    },
    close: () => database.close(),
  };
}

export async function setDoctorCode(context: TestContext, code = DOCTOR_CODE): Promise<void> {
  await context.database.db.insert(doctorAccessCodes).values({ codeHash: await hashSecret(code) });
}

let identityCounter = 0;

export function identity(overrides: Partial<VerifiedIdentity> = {}): VerifiedIdentity {
  identityCounter += 1;
  return {
    subject: `google-${identityCounter}`,
    email: `person${identityCounter}@gmail.com`,
    emailVerified: true,
    name: `Person ${identityCounter}`,
    pictureUrl: null,
    ...overrides,
  };
}

export type Agent = ReturnType<typeof request.agent>;

/** Goes through the whole Google sign-in with a cookie-keeping agent. */
export async function signIn(
  context: TestContext,
  who: VerifiedIdentity = identity(),
  returnTo?: string,
): Promise<{ agent: Agent; landing: string }> {
  const agent = request.agent(context.app);
  const startPath = returnTo
    ? `/api/auth/google/start?returnTo=${encodeURIComponent(returnTo)}`
    : '/api/auth/google/start';
  await agent.get(startPath).expect(303);

  const code = `code-${who.subject}`;
  context.provider.willReturn(code, who);
  const callback = await agent
    .get(`/api/auth/google/callback?code=${code}&state=${context.provider.lastState ?? ''}`)
    .expect(303);

  return { agent, landing: new URL(callback.headers.location ?? '').pathname };
}

/** POST from the web app's origin, as a browser would send it. */
export function post(agent: Agent, path: string, body?: object) {
  const pending = agent.post(path).set('Origin', WEB_ORIGIN);
  return body ? pending.send(body) : pending;
}
