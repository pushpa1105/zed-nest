import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Migration, MigrationProvider } from 'kysely/migration';

/**
 * Loads migration files from a folder.
 *
 * Kysely's built-in `FileMigrationProvider` passes raw paths to `import()`, which
 * breaks on Windows under ESM (`D:\...` is not a valid URL). This provider uses
 * `file://` URLs and works for `.ts` (dev, via tsx) and `.js` (compiled dist).
 */
export class ESMFileMigrationProvider implements MigrationProvider {
  constructor(private readonly folder: string) {}

  async getMigrations(): Promise<Record<string, Migration>> {
    const files = await readdir(this.folder);
    const migrations: Record<string, Migration> = {};

    for (const file of files.sort()) {
      const isMigration =
        (file.endsWith('.ts') && !file.endsWith('.d.ts') && !file.endsWith('.spec.ts')) ||
        file.endsWith('.js');
      if (!isMigration) continue;

      const module = (await import(pathToFileURL(join(this.folder, file)).href)) as Migration;
      migrations[file.replace(/\.(ts|js)$/, '')] = module;
    }
    return migrations;
  }
}
