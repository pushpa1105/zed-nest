import { join } from 'node:path';
import type { Kysely } from 'kysely';
import { Migrator, type MigrationResultSet } from 'kysely/migration';
import { ESMFileMigrationProvider } from './migration-provider.js';

export const MIGRATIONS_FOLDER = join(import.meta.dirname, 'migrations');

export function createMigrator(db: Kysely<any>): Migrator {
  return new Migrator({
    db,
    provider: new ESMFileMigrationProvider(MIGRATIONS_FOLDER),
    migrationTableName: 'kysely_migration',
    migrationLockTableName: 'kysely_migration_lock',
    // Branches merged in any order may add migrations with older timestamps; run them anyway.
    allowUnorderedMigrations: true,
  });
}

/** Runs all pending migrations, throwing on failure. Used by the CLI and e2e setup. */
export async function migrateToLatest(db: Kysely<any>): Promise<MigrationResultSet> {
  const result = await createMigrator(db).migrateToLatest();
  if (result.error) throw result.error;
  return result;
}
