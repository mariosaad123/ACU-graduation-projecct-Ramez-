import { healthResponseSchema } from '@acu/shared';
import { pino } from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from './app';
import type { ErrorResponseBody } from './http-error';

const app = createApp({
  env: { CORS_ORIGIN: 'http://localhost:5173' },
  logger: pino({ level: 'silent' }),
});

function errorOf(response: { body: unknown }): ErrorResponseBody['error'] {
  return (response.body as ErrorResponseBody).error;
}

describe('GET /api/health', () => {
  it('responds with a body that matches the shared contract', async () => {
    const response = await request(app).get('/api/health').expect(200);

    expect(healthResponseSchema.safeParse(response.body).success).toBe(true);
  });
});

describe('error handling', () => {
  it('returns a structured 404 for unknown routes', async () => {
    const response = await request(app).get('/api/does-not-exist').expect(404);

    expect(errorOf(response).code).toBe('NOT_FOUND');
    expect(errorOf(response).requestId).toBe(response.headers['x-request-id']);
  });

  it('rejects malformed JSON with a 400', async () => {
    const response = await request(app)
      .post('/api/health')
      .set('content-type', 'application/json')
      .send('{"broken":')
      .expect(400);

    expect(errorOf(response).code).toBe('MALFORMED_JSON');
  });

  it('rejects bodies above the size limit', async () => {
    const response = await request(app)
      .post('/api/health')
      .send({ text: 'x'.repeat(200_000) })
      .expect(413);

    expect(errorOf(response).code).toBe('PAYLOAD_TOO_LARGE');
  });
});

describe('security headers', () => {
  it('sets hardened defaults and hides the framework', async () => {
    const response = await request(app).get('/api/health');

    expect(response.headers['x-powered-by']).toBeUndefined();
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['content-security-policy']).toBeDefined();
  });

  it('allows the configured origin only', async () => {
    const allowed = await request(app).get('/api/health').set('origin', 'http://localhost:5173');
    const other = await request(app).get('/api/health').set('origin', 'https://evil.example');

    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(other.headers['access-control-allow-origin']).not.toBe('https://evil.example');
  });
});

describe('request ids', () => {
  it('keeps a well-formed incoming id', async () => {
    const response = await request(app).get('/api/health').set('x-request-id', 'trace-123');

    expect(response.headers['x-request-id']).toBe('trace-123');
  });

  it.each(['<script>alert(1)</script>', 'x'.repeat(65)])(
    'replaces an unsafe incoming id: %s',
    async (unsafeId) => {
      const response = await request(app).get('/api/health').set('x-request-id', unsafeId);

      expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    },
  );
});
