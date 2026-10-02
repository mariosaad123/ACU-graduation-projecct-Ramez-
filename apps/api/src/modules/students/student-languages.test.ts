import { LEARNING_LANGUAGES, meResponseSchema, type LearningLanguage } from '@acu/shared';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auditEvents, studentLanguages, users } from '../../db/schema';
import {
  WEB_ORIGIN,
  createTestContext,
  post,
  signIn,
  type Agent,
  type TestContext,
} from '../../test/harness';

let context: TestContext;

beforeAll(async () => {
  context = await createTestContext();
});

afterAll(async () => {
  await context.close();
});

const MINUTE_MS = 60 * 1000;

async function signInAsStudent(
  languages: LearningLanguage[] = ['en'],
  activeLanguage: LearningLanguage = languages[0] ?? 'en',
): Promise<Agent> {
  const { agent } = await signIn(context);
  await post(agent, '/api/onboarding/student', { languages, activeLanguage, goal: 'study' }).expect(
    200,
  );
  return agent;
}

function studentOf(response: { body: unknown }) {
  const student = meResponseSchema.parse(response.body).user.student;
  if (!student) {
    throw new Error('Expected a student account');
  }
  return student;
}

function errorCode(response: { body: unknown }): string {
  return (response.body as { error: { code: string } }).error.code;
}

function put(agent: Agent, path: string, body: object) {
  return agent.put(path).set('Origin', WEB_ORIGIN).send(body);
}

function remove(agent: Agent, language: string) {
  return agent.delete(`/api/student/languages/${language}`).set('Origin', WEB_ORIGIN);
}

async function auditActions(agent: Agent): Promise<string[]> {
  const userId = meResponseSchema.parse((await agent.get('/api/me').expect(200)).body).user.id;
  const events = await context.database.db
    .select({ action: auditEvents.action, metadata: auditEvents.metadata })
    .from(auditEvents)
    .where(eq(auditEvents.actorUserId, userId));
  return events
    .filter((event) => event.action.startsWith('student.'))
    .map((event) => `${event.action}:${String(event.metadata.language)}`);
}

describe('who can manage languages', () => {
  it('requires a session', async () => {
    const response = await context
      .client()
      .post('/api/student/languages')
      .set('Origin', WEB_ORIGIN)
      .send({ language: 'fr' })
      .expect(401);
    expect(errorCode(response)).toBe('UNAUTHENTICATED');
  });

  it('is for students only, not for accounts that have not chosen a role', async () => {
    const { agent } = await signIn(context);

    expect(errorCode(await post(agent, '/api/student/languages', { language: 'fr' }))).toBe(
      'FORBIDDEN',
    );
    expect(errorCode(await put(agent, '/api/student/active-language', { language: 'fr' }))).toBe(
      'FORBIDDEN',
    );
    expect(errorCode(await remove(agent, 'fr'))).toBe('FORBIDDEN');
  });

  it('refuses changes sent from another site', async () => {
    const agent = await signInAsStudent();
    const response = await agent
      .post('/api/student/languages')
      .set('Origin', 'https://evil.example')
      .send({ language: 'fr' })
      .expect(403);
    expect(errorCode(response)).toBe('CSRF_REJECTED');
  });
});

describe('adding a language', () => {
  it('adds the language after the existing ones and makes it active', async () => {
    const agent = await signInAsStudent(['fr']);
    context.advance(MINUTE_MS);

    const response = await post(agent, '/api/student/languages', { language: 'de' }).expect(201);

    expect(studentOf(response)).toMatchObject({ activeLanguage: 'de', languages: ['fr', 'de'] });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(studentOf(await agent.get('/api/me'))).toMatchObject({
      activeLanguage: 'de',
      languages: ['fr', 'de'],
    });
  });

  it('has no limit: a student can learn all six languages', async () => {
    const agent = await signInAsStudent(['en']);
    for (const language of LEARNING_LANGUAGES.filter((code) => code !== 'en')) {
      context.advance(MINUTE_MS);
      await post(agent, '/api/student/languages', { language }).expect(201);
    }

    const student = studentOf(await agent.get('/api/me'));
    expect([...student.languages].sort()).toEqual([...LEARNING_LANGUAGES].sort());
  });

  it('refuses a language the student already learns and changes nothing', async () => {
    const agent = await signInAsStudent(['en', 'fr'], 'fr');

    const response = await post(agent, '/api/student/languages', { language: 'en' }).expect(409);

    expect(errorCode(response)).toBe('LANGUAGE_ALREADY_ADDED');
    expect(studentOf(await agent.get('/api/me')).activeLanguage).toBe('fr');
  });

  it('refuses languages the platform does not teach', async () => {
    const agent = await signInAsStudent();
    const response = await post(agent, '/api/student/languages', { language: 'es' }).expect(400);

    expect(errorCode(response)).toBe('VALIDATION_FAILED');
  });

  it('records the addition in the audit log', async () => {
    const agent = await signInAsStudent(['en']);
    await post(agent, '/api/student/languages', { language: 'zh' }).expect(201);

    expect(await auditActions(agent)).toEqual(['student.language_added:zh']);
  });
});

describe('switching the active language', () => {
  it('switches to another language the student learns', async () => {
    const agent = await signInAsStudent(['en', 'ja'], 'en');

    const response = await put(agent, '/api/student/active-language', { language: 'ja' }).expect(
      200,
    );

    expect(studentOf(response)).toMatchObject({ activeLanguage: 'ja', languages: ['en', 'ja'] });
  });

  it('accepts the language that is already active', async () => {
    const agent = await signInAsStudent(['en', 'ja'], 'en');

    const response = await put(agent, '/api/student/active-language', { language: 'en' }).expect(
      200,
    );

    expect(studentOf(response).activeLanguage).toBe('en');
  });

  it('refuses a language the student has not added', async () => {
    const agent = await signInAsStudent(['en']);

    const response = await put(agent, '/api/student/active-language', { language: 'de' }).expect(
      404,
    );

    expect(errorCode(response)).toBe('LANGUAGE_NOT_ADDED');
    expect(studentOf(await agent.get('/api/me')).activeLanguage).toBe('en');
  });
});

describe('removing a language', () => {
  it('removes a language that is not active', async () => {
    const agent = await signInAsStudent(['en', 'fr', 'de'], 'de');

    const response = await remove(agent, 'fr').expect(200);

    expect(studentOf(response)).toMatchObject({ activeLanguage: 'de', languages: ['en', 'de'] });
  });

  it('makes the first remaining language active when the active one is removed', async () => {
    const agent = await signInAsStudent(['de']);
    context.advance(MINUTE_MS);
    await post(agent, '/api/student/languages', { language: 'ar' }).expect(201);
    context.advance(MINUTE_MS);
    await post(agent, '/api/student/languages', { language: 'zh' }).expect(201);

    const response = await remove(agent, 'zh').expect(200);

    expect(studentOf(response)).toMatchObject({ activeLanguage: 'de', languages: ['de', 'ar'] });
  });

  it('keeps the last language', async () => {
    const agent = await signInAsStudent(['fr']);

    const response = await remove(agent, 'fr').expect(409);

    expect(errorCode(response)).toBe('LAST_LANGUAGE');
    expect(studentOf(await agent.get('/api/me')).languages).toEqual(['fr']);
  });

  it('refuses a language the student has not added, or one that does not exist', async () => {
    const agent = await signInAsStudent(['en', 'fr']);

    expect(errorCode(await remove(agent, 'ja').expect(404))).toBe('LANGUAGE_NOT_ADDED');
    expect(errorCode(await remove(agent, 'klingon').expect(400))).toBe('VALIDATION_FAILED');
  });

  it('never leaves a student without a language, even when two removals race', async () => {
    const agent = await signInAsStudent(['en', 'fr'], 'en');

    const results = await Promise.all([remove(agent, 'en'), remove(agent, 'fr')]);

    expect(results.map((response) => response.status).sort()).toEqual([200, 409]);
    const student = studentOf(await agent.get('/api/me'));
    expect(student.languages).toHaveLength(1);
    expect(student.languages).toContain(student.activeLanguage);
  });

  it('records the removal in the audit log', async () => {
    const agent = await signInAsStudent(['en', 'fr']);
    await remove(agent, 'fr').expect(200);

    expect(await auditActions(agent)).toEqual(['student.language_removed:fr']);
  });
});

describe('database rules', () => {
  it('will not delete the language a profile points at', async () => {
    const agent = await signInAsStudent(['en', 'fr'], 'fr');
    const userId = meResponseSchema.parse((await agent.get('/api/me')).body).user.id;

    await expect(
      context.database.db
        .delete(studentLanguages)
        .where(and(eq(studentLanguages.userId, userId), eq(studentLanguages.language, 'fr'))),
    ).rejects.toThrow();
  });

  it('removes the languages together with the account', async () => {
    const agent = await signInAsStudent(['en', 'fr']);
    const userId = meResponseSchema.parse((await agent.get('/api/me')).body).user.id;

    await context.database.db.delete(users).where(eq(users.id, userId));

    const left = await context.database.db
      .select()
      .from(studentLanguages)
      .where(eq(studentLanguages.userId, userId));
    expect(left).toEqual([]);
  });
});
