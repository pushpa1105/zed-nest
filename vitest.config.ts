import { defineConfig } from 'vitest/config';

/** Unit tests: fast, no I/O. Co-located next to the code as `*.spec.ts`. */
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.spec.ts', 'scripts/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.spec.ts',
        'src/main.ts',
        'src/infrastructure/database/migrations/**',
        'src/infrastructure/database/cli/**',
        'src/core/openapi/cli/**',
      ],
    },
  },
});
