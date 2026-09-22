import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

// Mirrors the esbuild `--alias:@porchlight/shared=...` used in the build script (Phase 1
// pattern) — functions/package.json intentionally carries no `workspace:` specifier for
// @porchlight/shared (Cloud Build's remote npm install can't resolve those), so Vitest needs
// the same alias esbuild uses to resolve the import at test time.
export default defineConfig({
  resolve: {
    alias: {
      '@porchlight/shared': fileURLToPath(new URL('../packages/shared/src/index.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
  },
});
