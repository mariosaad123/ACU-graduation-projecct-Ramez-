import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

const API_DEV_ORIGIN = 'http://localhost:4000';

/**
 * The emoji picker reads its list from JSON files. They are served from this site rather than a
 * CDN, so the picker works under the content security policy and without an outside request.
 */
function emojiData(): Plugin {
  return {
    name: 'emoji-data',
    buildStart() {
      const require = createRequire(import.meta.url);
      const source = dirname(require.resolve('emojibase-data/package.json'));
      const target = join(dirname(fileURLToPath(import.meta.url)), 'public', 'emoji', 'en');
      mkdirSync(target, { recursive: true });
      for (const file of ['data.json', 'messages.json']) {
        copyFileSync(join(source, 'en', file), join(target, file));
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), emojiData()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': API_DEV_ORIGIN,
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: { modules: { classNameStrategy: 'non-scoped' } },
  },
});
