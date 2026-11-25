import { inject } from 'vitest';

// Runs in every test worker before the suites. Real env vars always win over .env,
// so these values are what the app sees.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = inject('databaseUrl');
process.env.LOG_LEVEL = 'silent';
process.env.LOG_PRETTY = 'false';
process.env.API_DOCS_ENABLED = 'false';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-test-access-secret-0001';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-test-refresh-secret-01';
