import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

// Mirrors apps/web/vite.config.ts's '@' alias so Vitest resolves the same '@/...' imports
// used throughout src/ (functions/vitest.config.ts established this per-workspace-package
// vitest config pattern in 04-01).
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
  },
});
