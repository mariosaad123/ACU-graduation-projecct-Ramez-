import { meResponseSchema } from '@acu/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auditEvents, sessions, users } from '../../db/schema';
import {
  WEB_ORIGIN,
  createTestContext,
  identity,
  post,
  signIn,
  type TestContext,
} from '../../test/harness';
import { SESSION_IDLE_TIMEOUT_MS, SESSION_MAX_AGE_MS } from './sessions';

let context: TestContext;

beforeAll(async () => {
  context = await createTestContext();
});

afterAll(async () => {
  await context.close();
});

const DAY_MS = 24 * 60 * 60 * 1000;

describe('starting Google sign-in', () => {
  it('redirects to Google with our callback and remembers the attempt in a cookie', async () => {
    const response = await context.client().get('/api/auth/google/start').expect(303);

    const location = new URL(response.headers.location ?? '');
    expect(location.origin).toBe('https://accounts.google.test');
    expect(location.searchParams.get('redirect_uri')).toBe(
      `${WEB_ORIGIN}/api/auth/google/callback`,
    );

    const cookie = String(response.headers['set-cookie']);
    expect(cookie).toMatch(/acu_oauth=[0-9a-f-]{36}/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
  });

  it('sends people back to the sign-in page when Google is not configured', async () => {
    const unconfigured = await createTestContext({
      googleConfigured: false,
      shareDatabaseWith: context,
    });
    const response = await unconfigured.client().get('/api/auth/google/start').expect(303);

    expect(response.headers.location).toBe(`${WEB_ORIGIN}/sign-in?error=google_unavailable`);
    await unconfigured.close();
  });
});

describe('completing Google sign-in', () => {
  it('creates the account, opens a session and sends a new person to choose a role', async () => {
    const person = identity({ name: 'Salma Hassan' });
    const { agent, landing } = await signIn(context, person);

    expect(landing).toBe('/welcome');

    const me = await agent.get('/api/me').expect(200);
    const parsed = meResponseSchema.parse(me.body);
    expect(parsed.user).toMatchObject({
      name: 'Salma Hassan',
      email: person.email,
      role: null,
      student: null,
      doctor: null,
    });
  });

  it('stores only a hash of the session token', async () => {
    const { agent } = await signIn(context);
    const me = await agent.get('/api/me').expect(200);
    const userId = meResponseSchema.parse(me.body).user.id;

    const [stored] = await context.database.db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, userId));
    expect(stored?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('updates the profile of a returning person instead of creating a second account', async () => {
    const person = identity();
    await signIn(context, person);
    await signIn(context, { ...person, name: 'New Name' });

    const rows = await context.database.db
      .select()
      .from(users)
      .where(eq(users.googleSubject, person.subject));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe('New Name');
  });

  it('returns people to the page they asked for, but never to another site', async () => {
    const person = identity();
    await signIn(context, person);
    await context.database.db
      .update(users)
      .set({ role: 'student' })
      .where(eq(users.googleSubject, person.subject));

    expect((await signIn(context, person, '/library?book=3')).landing).toBe('/library');
    expect((await signIn(context, person, '//evil.example/steal')).landing).toBe('/app');
    expect((await signIn(context, person, 'https://evil.example')).landing).toBe('/app');
  });

  it('refuses Google accounts whose email is not verified', async () => {
    const agent = context.client();
    await agent.get('/api/auth/google/start').expect(303);
    context.provider.willReturn('unverified', identity({ emailVerified: false }));

    const response = await agent
      .get(`/api/auth/google/callback?code=unverified&state=${context.provider.lastState ?? ''}`)
      .expect(303);

    expect(response.headers.location).toBe(`${WEB_ORIGIN}/sign-in?error=unverified_email`);
  });

  it('rejects a callback whose state does not match', async () => {
    const agent = context.client();
    await agent.get('/api/auth/google/start').expect(303);
    context.provider.willReturn('forged', identity());

    const response = await agent
      .get('/api/auth/google/callback?code=forged&state=attacker-state')
      .expect(303);

    expect(response.headers.location).toBe(`${WEB_ORIGIN}/sign-in?error=failed`);
  });

  it('rejects a callback without the sign-in cookie, or used twice', async () => {
    const withoutCookie = await context
      .client()
      .get('/api/auth/google/callback?code=x&state=y')
      .expect(303);
    expect(withoutCookie.headers.location).toBe(`${WEB_ORIGIN}/sign-in?error=expired`);

    const agent = context.client();
    const start = await agent.get('/api/auth/google/start').expect(303);
    const flowCookie = String(start.headers['set-cookie']).split(';')[0] ?? '';
    const person = identity();
    context.provider.willReturn('once', person);
    const callback = `/api/auth/google/callback?code=once&state=${context.provider.lastState ?? ''}`;

    await agent.get(callback).expect(303);
    const replay = await context.client().get(callback).set('Cookie', flowCookie).expect(303);
    expect(replay.headers.location).toBe(`${WEB_ORIGIN}/sign-in?error=expired`);
  });

  it('treats a sign-in cancelled on Google as cancelled', async () => {
    const agent = context.client();
    await agent.get('/api/auth/google/start').expect(303);

    const response = await agent.get('/api/auth/google/callback?error=access_denied').expect(303);
    expect(response.headers.location).toBe(`${WEB_ORIGIN}/sign-in?error=cancelled`);
  });

  it('expires sign-in attempts after ten minutes', async () => {
    const agent = context.client();
    await agent.get('/api/auth/google/start').expect(303);
    context.provider.willReturn('slow', identity());
    context.advance(11 * 60 * 1000);

    const response = await agent
      .get(`/api/auth/google/callback?code=slow&state=${context.provider.lastState ?? ''}`)
      .expect(303);
    expect(response.headers.location).toBe(`${WEB_ORIGIN}/sign-in?error=expired`);
  });

  it('keeps disabled accounts out', async () => {
    const person = identity();
    await signIn(context, person);
    await context.database.db
      .update(users)
      .set({ disabledAt: new Date() })
      .where(eq(users.googleSubject, person.subject));

    const agent = context.client();
    await agent.get('/api/auth/google/start').expect(303);
    context.provider.willReturn('disabled', person);
    const response = await agent
      .get(`/api/auth/google/callback?code=disabled&state=${context.provider.lastState ?? ''}`)
      .expect(303);
    expect(response.headers.location).toBe(`${WEB_ORIGIN}/sign-in?error=disabled`);
  });

  it('records each sign-in in the audit log', async () => {
    const person = identity();
    const { agent } = await signIn(context, person);
    const me = meResponseSchema.parse((await agent.get('/api/me')).body);

    const events = await context.database.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.actorUserId, me.user.id));
    expect(events.map((event) => event.action)).toContain('auth.signed_in');
  });
});

describe('sessions', () => {
  it('answers 401 without a session', async () => {
    const response = await context.client().get('/api/me').expect(401);
    expect((response.body as { error: { code: string } }).error.code).toBe('UNAUTHENTICATED');
  });

  it('ignores a forged session cookie', async () => {
    await context.client().get('/api/me').set('Cookie', 'acu_session=forged-token').expect(401);
  });

  it('ends after 14 days without use', async () => {
    const { agent } = await signIn(context);
    context.advance(SESSION_IDLE_TIMEOUT_MS + 1000);
    await agent.get('/api/me').expect(401);
  });

  it('stays alive while it is used, but never beyond 30 days', async () => {
    const { agent } = await signIn(context);
    for (let used = 0; used < SESSION_MAX_AGE_MS - 10 * DAY_MS; used += 10 * DAY_MS) {
      context.advance(10 * DAY_MS);
      await agent.get('/api/me').expect(200);
    }
    context.advance(10 * DAY_MS);
    await agent.get('/api/me').expect(401);
  });

  it('signs out the current device', async () => {
    const { agent } = await signIn(context);
    await post(agent, '/api/auth/sign-out').expect(204);
    await agent.get('/api/me').expect(401);
  });

  it('signs out every device at once', async () => {
    const person = identity();
    const laptop = await signIn(context, person);
    const phone = await signIn(context, person);

    await post(laptop.agent, '/api/auth/sign-out-everywhere').expect(204);

    await laptop.agent.get('/api/me').expect(401);
    await phone.agent.get('/api/me').expect(401);
  });

  it('never exposes the token hash or Google subject', async () => {
    const { agent } = await signIn(context);
    const response = await agent.get('/api/me').expect(200);
    const text = JSON.stringify(response.body);

    expect(text).not.toMatch(/google|tokenHash|subject/i);
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('makes the cookie unreadable to scripts', async () => {
    const agent = context.client();
    await agent.get('/api/auth/google/start');
    context.provider.willReturn('cookie-check', identity());
    const response = await agent.get(
      `/api/auth/google/callback?code=cookie-check&state=${context.provider.lastState ?? ''}`,
    );

    const sessionCookie = (response.headers['set-cookie'] as unknown as string[]).find((cookie) =>
      cookie.startsWith('acu_session='),
    );
    expect(sessionCookie).toMatch(/HttpOnly/i);
    expect(sessionCookie).toMatch(/SameSite=Lax/i);
    expect(sessionCookie).toMatch(/Path=\//);
  });
});
