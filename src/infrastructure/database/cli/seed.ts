/**
 * Seed CLI — runs every file in ../seeds in name order.
 *
 *   pnpm db:seed
 *
 * Seeds MUST be idempotent (safe to run many times). Use them for reference data
 * and local bootstrap users — never for test fixtures (tests create their own data).
 */
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Kysely } from 'kysely';
import { loadConfig, type AppConfig } from '../../../config/app-config.js';
import type { PasswordHasher } from '../../../shared/security/password-hasher.js';
import { Argon2PasswordHasher } from '../../security/argon2-password-hasher.js';
import type { Database } from '../database.schema.js';
import { createDatabase } from '../kysely.factory.js';

export interface SeedContext {
  db: Kysely<Database>;
  config: AppConfig;
  hasher: PasswordHasher;
  log: (message: string) => void;
}

type SeedModule = { seed: (ctx: SeedContext) => Promise<void> };

async function main(): Promise<void> {
  const config = loadConfig();
  const db = createDatabase(config.database);
  const folder = join(import.meta.dirname, '..', 'seeds');

  try {
    const files = (await readdir(folder))
      .filter((f) => /\.(ts|js)$/.test(f) && !f.endsWith('.d.ts'))
      .sort();

    for (const file of files) {
      const mod = (await import(pathToFileURL(join(folder, file)).href)) as SeedModule;
      await mod.seed({
        db,
        config,
        hasher: new Argon2PasswordHasher(),
        log: (message) => console.log(`  [${file}] ${message}`),
      });
    }
    console.log(`✔ ${files.length} seed file(s) executed`);
  } finally {
    await db.destroy();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
