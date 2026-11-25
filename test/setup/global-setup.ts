import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { TestProject } from 'vitest/node';
import { createDatabase } from '../../src/infrastructure/database/kysely.factory.js';
import { migrateToLatest } from '../../src/infrastructure/database/migrator.js';

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

/**
 * Runs once before all e2e suites:
 *  - starts a throwaway PostgreSQL in Docker (or uses TEST_DATABASE_URL if set,
 *    e.g. a CI service container),
 *  - applies all migrations,
 *  - hands the connection string to the test workers.
 */
export default async function setup(project: TestProject) {
  let container: StartedPostgreSqlContainer | undefined;
  let url = process.env.TEST_DATABASE_URL;

  if (!url) {
    container = await new PostgreSqlContainer('postgres:18-alpine').start();
    url = container.getConnectionUri();
  }

  const db = createDatabase(
    {
      client: 'postgres',
      url,
      poolMax: 2,
      ssl: false,
      statementTimeoutMs: 0,
      connectionTimeoutMs: 10_000,
      idleTimeoutMs: 0,
      idleInTransactionTimeoutMs: 0,
      logQueries: false,
    },
    { camelCase: false },
  );
  try {
    await migrateToLatest(db);
  } finally {
    await db.destroy();
  }

  project.provide('databaseUrl', url);

  return async () => {
    await container?.stop();
  };
}
