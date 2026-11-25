import { defineConfig } from 'vitest/config';

/**
 * End-to-end tests: boot the real Nest app against a real PostgreSQL.
 * `globalSetup` starts a disposable Postgres (Testcontainers) unless
 * TEST_DATABASE_URL is provided, and runs all migrations once.
 */
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    globalSetup: ['./test/setup/global-setup.ts'],
    setupFiles: ['./test/setup/env-setup.ts'],
    fileParallelism: false,
    hookTimeout: 120_000,
    testTimeout: 30_000,
  },
});
