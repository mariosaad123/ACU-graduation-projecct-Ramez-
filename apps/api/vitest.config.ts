import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Integration tests start an embedded PostgreSQL and hash with Argon2, both deliberately slow.
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
