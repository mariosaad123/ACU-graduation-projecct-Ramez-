import { healthResponseSchema } from '@acu/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WEB_ORIGIN, createTestContext, type TestContext } from '../test/harness';
import type { ErrorResponseBody } from './http-error';

let context: TestContext;

beforeAll(async () => {
  context = await createTestContext();
});

afterAll(async () => {
  await context.close();
});

function errorOf(response: { body: unknown }): ErrorResponseBody['error'] {
  return (response.body as ErrorResponseBody).error;
}

describe('GET /api/health', () => {
  it('responds with a body that matches the shared contract', async () => {
    const response = await context.client().get('/api/health').expect(200);

    expect(healthResponseSchema.safeParse(response.body).success).toBe(true);
  });
});

describe('error handling', () => {
  it('returns a structured 404 for unknown routes', async () => {
    const response = await context.client().get('/api/does-not-exist').expect(404);

    expect(errorOf(response).code).toBe('NOT_FOUND');
    expect(errorOf(response).requestId).toBe(response.headers['x-request-id']);
  });

  it('rejects malformed JSON with a 400', async () => {
    const response = await context
      .client()
      .post('/api/health')
      .set('Origin', WEB_ORIGIN)
      .set('content-type', 'application/json')
      .send('{"broken":')
      .expect(400);

    expect(errorOf(response).code).toBe('MALFORMED_JSON');
  });

  it('rejects bodies above the size limit', async () => {
    const response = await context
      .client()
      .post('/api/health')
      .set('Origin', WEB_ORIGIN)
      .send({ text: 'x'.repeat(200_000) })
      .expect(413);

    expect(errorOf(response).code).toBe('PAYLOAD_TOO_LARGE');
  });
});

describe('CSRF protection', () => {
  it.each([
    ['no origin', undefined],
    ['another site', 'https://evil.example'],
    ['a look-alike host', 'http://localhost:5173.evil.example'],
  ])('refuses state-changing requests from %s', async (_label, origin) => {
    const pending = context.client().post('/api/auth/sign-out');
    const response = await (origin ? pending.set('Origin', origin) : pending).expect(403);

    expect(errorOf(response).code).toBe('CSRF_REJECTED');
  });

  it('accepts the Referer header when Origin is missing', async () => {
    await context
      .client()
      .post('/api/auth/sign-out')
      .set('Referer', `${WEB_ORIGIN}/app`)
      .expect(204);
  });

  it('lets safe reads through without an origin', async () => {
    await context.client().get('/api/health').expect(200);
  });
});

describe('rate limiting', () => {
  it('slows down one address that sends too many sign-in requests', async () => {
    const limited = await createTestContext({
      shareDatabaseWith: context,
      rateLimits: {
        api: { windowMs: 60_000, limit: 1000 },
        auth: { windowMs: 60_000, limit: 3 },
        onboarding: { windowMs: 60_000, limit: 3 },
      },
    });

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await limited.client().get('/api/auth/google/start').expect(303);
    }
    const blocked = await limited.client().get('/api/auth/google/start').expect(429);

    expect(errorOf(blocked).code).toBe('RATE_LIMITED');
    expect(blocked.headers.ratelimit).toBeDefined();
    await limited.close();
  });
});

describe('security headers', () => {
  it('sets hardened defaults and hides the framework', async () => {
    const response = await context.client().get('/api/health');

    expect(response.headers['x-powered-by']).toBeUndefined();
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['content-security-policy']).toBeDefined();
  });

  it('allows the configured origin only', async () => {
    const allowed = await context.client().get('/api/health').set('origin', WEB_ORIGIN);
    const other = await context.client().get('/api/health').set('origin', 'https://evil.example');

    expect(allowed.headers['access-control-allow-origin']).toBe(WEB_ORIGIN);
    expect(other.headers['access-control-allow-origin']).not.toBe('https://evil.example');
  });
});

describe('request ids', () => {
  it('keeps a well-formed incoming id', async () => {
    const response = await context.client().get('/api/health').set('x-request-id', 'trace-123');

    expect(response.headers['x-request-id']).toBe('trace-123');
  });

  it.each(['<script>alert(1)</script>', 'x'.repeat(65)])(
    'replaces an unsafe incoming id: %s',
    async (unsafeId) => {
      const response = await context.client().get('/api/health').set('x-request-id', unsafeId);

      expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    },
  );
});
