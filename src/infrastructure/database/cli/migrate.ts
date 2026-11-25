/**
 * Migration CLI.
 *
 *   pnpm db:migrate                 → apply all pending migrations
 *   pnpm db:migrate:up              → apply the next pending migration
 *   pnpm db:migrate:down            → roll back the last migration
 *   pnpm db:migrate:create <name>   → scaffold a new migration file
 *   pnpm db:migrate status          → list applied / pending migrations
 *
 * In production (compiled):  node dist/infrastructure/database/cli/migrate.js latest
 */
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { MigrationResultSet } from 'kysely/migration';
import { loadConfig } from '../../../config/app-config.js';
import { createDatabase } from '../kysely.factory.js';
import { createMigrator, MIGRATIONS_FOLDER } from '../migrator.js';

const TEMPLATE = `import type { Kysely } from 'kysely';

// Write snake_case identifiers. Never import application types here.
// Docs: https://kysely.dev/docs/migrations

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('things')
    .addColumn('id', 'uuid', (col) => col.primaryKey())
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('things').execute();
}
`;

function timestamp(): string {
  return new Date().toISOString().replace(/\D/g, '').slice(0, 14);
}

function report({ error, results }: MigrationResultSet): void {
  for (const r of results ?? []) {
    const icon = r.status === 'Success' ? '✔' : r.status === 'Error' ? '✖' : '•';
    console.log(`${icon} ${r.direction.padEnd(4)} ${r.migrationName} (${r.status})`);
  }
  if (!results?.length && !error) console.log('Nothing to do — database is up to date.');
  if (error) {
    console.error('Migration failed:', error);
    process.exitCode = 1;
  }
}

async function main(): Promise<void> {
  const [command = 'latest', name] = process.argv.slice(2);

  if (command === 'create') {
    if (!name || !/^[a-z0-9_]+$/.test(name)) {
      throw new Error('Usage: pnpm db:migrate:create <snake_case_name>');
    }
    const file = join(MIGRATIONS_FOLDER, `${timestamp()}_${name}.ts`);
    await writeFile(file, TEMPLATE, { flag: 'wx' });
    console.log(`Created ${file}`);
    return;
  }

  const config = loadConfig();
  const db = createDatabase(config.database, { camelCase: false });
  const migrator = createMigrator(db);

  try {
    switch (command) {
      case 'latest':
        report(await migrator.migrateToLatest());
        break;
      case 'up':
        report(await migrator.migrateUp());
        break;
      case 'down':
        report(await migrator.migrateDown());
        break;
      case 'status':
        for (const m of await migrator.getMigrations()) {
          console.log(`${m.executedAt ? '✔ applied' : '• pending'}  ${m.name}`);
        }
        break;
      default:
        throw new Error(`Unknown command "${command}". Use latest | up | down | status | create.`);
    }
  } finally {
    await db.destroy();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
