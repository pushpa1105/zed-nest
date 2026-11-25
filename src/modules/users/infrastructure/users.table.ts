import type { ColumnType, Insertable, Selectable, Updateable } from 'kysely';
import type { Role } from '../../../shared/security/role.js';

/**
 * Kysely table type for `users` (camelCase; CamelCasePlugin maps to snake_case).
 * `ColumnType<Select, Insert, Update>` encodes what can be written when:
 * `createdAt` is set once by default and never updated.
 *
 * Registered in infrastructure/database/database.schema.ts.
 */
export interface UsersTable {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
  role: Role;
  createdAt: ColumnType<Date, Date | undefined, never>;
  updatedAt: ColumnType<Date, Date | undefined, Date>;
}

export type UserRow = Selectable<UsersTable>;
export type NewUserRow = Insertable<UsersTable>;
export type UserRowUpdate = Updateable<UsersTable>;
