import type { AuthSessionsTable } from '../../modules/auth/infrastructure/auth-sessions.table.js';
import type { UsersTable } from '../../modules/users/infrastructure/users.table.js';

/**
 * The typed database schema used by Kysely.
 *
 * Each feature owns its table definitions (in `modules/<feature>/infrastructure/*.table.ts`);
 * this file only registers them. Property names are camelCase — the
 * `CamelCasePlugin` maps them to snake_case tables/columns in SQL.
 *
 * Keep in sync with migrations. `pnpm gen:feature` appends here automatically.
 */
export interface Database {
  users: UsersTable;
  authSessions: AuthSessionsTable;
  // <gen:tables> — generator anchor, do not remove
}
