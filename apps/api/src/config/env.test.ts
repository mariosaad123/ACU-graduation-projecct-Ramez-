import { describe, expect, it } from 'vitest';
import { loadEnv } from './env';

describe('loadEnv', () => {
  it('applies defaults for a development setup', () => {
    expect(loadEnv({})).toEqual({
      NODE_ENV: 'development',
      API_PORT: 4000,
      LOG_LEVEL: 'info',
      CORS_ORIGIN: 'http://localhost:5173',
    });
  });

  it('coerces the port from a string', () => {
    expect(loadEnv({ API_PORT: '8080' }).API_PORT).toBe(8080);
  });

  it('fails fast on invalid values', () => {
    expect(() => loadEnv({ API_PORT: 'eighty' })).toThrow(/Invalid environment configuration/);
    expect(() => loadEnv({ CORS_ORIGIN: 'not a url' })).toThrow(/CORS_ORIGIN/);
  });
});
