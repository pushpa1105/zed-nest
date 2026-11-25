import { buildPage, toOffset, type Page } from '../../../shared/pagination/index.js';
import { User } from '../domain/user.js';
import { UserEmailTakenError } from '../domain/user.errors.js';
import { UserRepository, type UserListQuery } from '../domain/user.repository.js';

/**
 * In-memory implementation of the `UserRepository` port for unit tests.
 * Proves the point of ports & adapters: services run without any database.
 */
export class InMemoryUserRepository extends UserRepository {
  readonly rows = new Map<string, User>();

  async findById(id: string): Promise<User | null> {
    return this.clone(this.rows.get(id));
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.clone([...this.rows.values()].find((u) => u.email === email));
  }

  async existsByEmail(email: string): Promise<boolean> {
    return [...this.rows.values()].some((u) => u.email === email);
  }

  async list(query: UserListQuery): Promise<Page<User>> {
    const term = query.search?.toLowerCase();
    const filtered = [...this.rows.values()]
      .filter((u) => !query.role || u.role === query.role)
      .filter((u) => !term || u.email.includes(term) || u.displayName.toLowerCase().includes(term))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const items = filtered.slice(toOffset(query), toOffset(query) + query.limit);
    return buildPage(items, filtered.length, query);
  }

  async insert(user: User): Promise<void> {
    if (await this.existsByEmail(user.email)) throw new UserEmailTakenError(user.email);
    this.rows.set(user.id, this.clone(user)!);
  }

  async update(user: User): Promise<void> {
    this.rows.set(user.id, this.clone(user)!);
  }

  async delete(id: string): Promise<boolean> {
    return this.rows.delete(id);
  }

  /** Stores copies so tests catch "forgot to call update()" bugs. */
  private clone(user: User | undefined): User | null {
    return user ? User.restore(user.toSnapshot()) : null;
  }
}
