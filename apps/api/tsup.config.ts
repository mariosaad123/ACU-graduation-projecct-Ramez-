import { defineConfig } from 'tsup';

export default defineConfig({
  // The commands are built too, so a production host runs them with plain Node.
  entry: [
    'src/server.ts',
    'src/cli/migrate.ts',
    'src/cli/set-doctor-code.ts',
    'src/cli/grant-admin.ts',
  ],
  format: 'esm',
  platform: 'node',
  target: 'node24',
  sourcemap: true,
  clean: true,
  noExternal: ['@acu/shared'],
});
