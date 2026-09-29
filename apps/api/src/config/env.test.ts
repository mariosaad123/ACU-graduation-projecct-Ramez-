import { describe, expect, it } from 'vitest';
import { loadEnv } from './env';

const production = {
  NODE_ENV: 'production',
  WEB_ORIGIN: 'https://languages.acu.edu.eg',
  DATABASE_URL: 'postgres://app:secret@db:5432/acu',
  GOOGLE_CLIENT_ID: 'client-id',
  GOOGLE_CLIENT_SECRET: 'client-secret',
  MAIL_TRANSPORT: 'smtp',
  SMTP_URL: 'smtps://user:pass@smtp.example.com',
};

describe('loadEnv', () => {
  it('applies safe defaults for local development', () => {
    const env = loadEnv({});

    expect(env).toMatchObject({
      NODE_ENV: 'development',
      API_PORT: 4000,
      WEB_ORIGIN: 'http://localhost:5173',
      DATABASE_URL: 'pglite:.data/dev-db',
      MAIL_TRANSPORT: 'console',
      UNIVERSITY_EMAIL_DOMAIN: 'acu.edu.eg',
    });
    expect(env.GOOGLE_CLIENT_ID).toBeUndefined();
  });

  it('coerces numbers from strings', () => {
    expect(loadEnv({ API_PORT: '8080', TRUST_PROXY: '1' })).toMatchObject({
      API_PORT: 8080,
      TRUST_PROXY: 1,
    });
  });

  it('treats empty optional values as missing', () => {
    expect(
      loadEnv({ GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '' }).GOOGLE_CLIENT_ID,
    ).toBeUndefined();
  });

  it('fails fast on invalid values', () => {
    expect(() => loadEnv({ API_PORT: 'eighty' })).toThrow(/Invalid environment configuration/);
    expect(() => loadEnv({ WEB_ORIGIN: 'not a url' })).toThrow(/WEB_ORIGIN/);
    expect(() => loadEnv({ DATABASE_URL: 'mysql://x' })).toThrow(/DATABASE_URL/);
  });

  it('requires Google credentials in pairs', () => {
    expect(() => loadEnv({ GOOGLE_CLIENT_ID: 'only-id' })).toThrow(/GOOGLE_CLIENT_SECRET/);
  });

  it('requires an SMTP URL for the smtp transport', () => {
    expect(() => loadEnv({ MAIL_TRANSPORT: 'smtp' })).toThrow(/SMTP_URL/);
  });

  it('accepts a complete production configuration', () => {
    expect(loadEnv(production).NODE_ENV).toBe('production');
  });

  it.each([
    ['GOOGLE_CLIENT_ID', { GOOGLE_CLIENT_ID: undefined, GOOGLE_CLIENT_SECRET: undefined }],
    ['MAIL_TRANSPORT', { MAIL_TRANSPORT: 'console' }],
    ['DATABASE_URL', { DATABASE_URL: 'pglite:memory' }],
    ['WEB_ORIGIN', { WEB_ORIGIN: 'http://languages.acu.edu.eg' }],
  ])('refuses to start in production without a safe %s', (key, override) => {
    expect(() => loadEnv({ ...production, ...override })).toThrow(new RegExp(key));
  });
});
