import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Every integration test file starts its own embedded PostgreSQL and hashes with Argon2.
    // Both are CPU-heavy, so a few files at a time is faster and far steadier than one per core.
    maxWorkers: 2,
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
