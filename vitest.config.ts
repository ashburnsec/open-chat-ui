import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      // Mirror Next's "@/" alias.
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    // happy-dom for components / hooks; node for pure-JS lib tests.
    // Per-file `// @vitest-environment node` overrides if needed.
    environment: 'happy-dom',
    globals: true,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['**/node_modules/**', '**/.next/**', '**/dist/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['**/*.test.ts', '**/*.test.tsx', '**/*.d.ts'],
    },
  },
});
