import type { Page, PageRequest } from '../../../shared/pagination/index.js';
import type { Role } from '../../../shared/security/role.js';
import type { User } from './user.js';

export interface UserListQuery extends PageRequest {
  /** Case-insensitive match on email or display name. */
  search?: string;
  role?: Role;
}

/**
 * Persistence PORT for users.
 *
 * The application layer depends on this abstraction only. The Kysely adapter
 * (infrastructure/kysely-user.repository.ts) implements it; swapping to Prisma,
 * Drizzle, TypeORM, an HTTP service or an in-memory fake means writing another
 * implementation and changing ONE binding in users.module.ts.
 *
 * Abstract class (not interface) so it is also the Nest DI token.
 */
export abstract class UserRepository {
  abstract findById(id: string): Promise<User | null>;
  abstract findByEmail(email: string): Promise<User | null>;
  abstract existsByEmail(email: string): Promise<boolean>;
  abstract list(query: UserListQuery): Promise<Page<User>>;
  /** @throws UserEmailTakenError when the email is already registered. */
  abstract insert(user: User): Promise<void>;
  abstract update(user: User): Promise<void>;
  /** @returns false when nothing was deleted. */
  abstract delete(id: string): Promise<boolean>;
}
