import { User } from '../domain/user.js';
import type { NewUserRow, UserRow, UserRowUpdate } from './users.table.js';

/** Translates between the persistence shape (rows) and the domain entity. */
export const UserMapper = {
  toDomain(row: UserRow): User {
    return User.restore({
      id: row.id,
      email: row.email,
      passwordHash: row.passwordHash,
      displayName: row.displayName,
      role: row.role,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  },

  toInsert(user: User): NewUserRow {
    const s = user.toSnapshot();
    return {
      id: s.id,
      email: s.email,
      passwordHash: s.passwordHash,
      displayName: s.displayName,
      role: s.role,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    };
  },

  toUpdate(user: User): UserRowUpdate {
    const s = user.toSnapshot();
    return {
      email: s.email,
      passwordHash: s.passwordHash,
      displayName: s.displayName,
      role: s.role,
      updatedAt: s.updatedAt,
    };
  },
};
