import { Injectable } from '@nestjs/common';
import { isUniqueViolation } from '../../../infrastructure/database/database-error.translator.js';
import { InjectDb, type DbTransactionHost } from '../../../infrastructure/database/transaction.js';
import { escapeLike } from '../../../infrastructure/database/query-helpers.js';
import { buildPage, toOffset, type Page } from '../../../shared/pagination/index.js';
import type { User } from '../domain/user.js';
import { UserEmailTakenError } from '../domain/user.errors.js';
import { UserRepository, type UserListQuery } from '../domain/user.repository.js';
import { UserMapper } from './user.mapper.js';

/**
 * Kysely ADAPTER for the `UserRepository` port.
 *
 * All SQL for users lives here. Every query goes through `this.db.tx`, so it
 * transparently joins any surrounding `@Transactional()` call.
 */
@Injectable()
export class KyselyUserRepository extends UserRepository {
  constructor(@InjectDb() private readonly db: DbTransactionHost) {
    super();
  }

  async findById(id: string): Promise<User | null> {
    const row = await this.db.tx
      .selectFrom('users')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? UserMapper.toDomain(row) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const row = await this.db.tx
      .selectFrom('users')
      .selectAll()
      .where('email', '=', email)
      .executeTakeFirst();
    return row ? UserMapper.toDomain(row) : null;
  }

  async existsByEmail(email: string): Promise<boolean> {
    const row = await this.db.tx
      .selectFrom('users')
      .select('id')
      .where('email', '=', email)
      .executeTakeFirst();
    return row !== undefined;
  }

  async list(query: UserListQuery): Promise<Page<User>> {
    let base = this.db.tx.selectFrom('users');

    if (query.search) {
      const term = `%${escapeLike(query.search)}%`;
      base = base.where((eb) =>
        eb.or([eb('email', 'ilike', term), eb('displayName', 'ilike', term)]),
      );
    }
    if (query.role) {
      base = base.where('role', '=', query.role);
    }

    const [rows, total] = await Promise.all([
      base
        .selectAll()
        .orderBy('createdAt', 'desc')
        .orderBy('id', 'desc')
        .limit(query.limit)
        .offset(toOffset(query))
        .execute(),
      base.select((eb) => eb.fn.countAll<string>().as('count')).executeTakeFirstOrThrow(),
    ]);

    return buildPage(
      rows.map((row) => UserMapper.toDomain(row)),
      Number(total.count),
      query,
    );
  }

  async insert(user: User): Promise<void> {
    try {
      await this.db.tx.insertInto('users').values(UserMapper.toInsert(user)).execute();
    } catch (error) {
      if (isUniqueViolation(error, 'users_email_key')) throw new UserEmailTakenError(user.email);
      throw error;
    }
  }

  async update(user: User): Promise<void> {
    try {
      await this.db.tx
        .updateTable('users')
        .set(UserMapper.toUpdate(user))
        .where('id', '=', user.id)
        .execute();
    } catch (error) {
      if (isUniqueViolation(error, 'users_email_key')) throw new UserEmailTakenError(user.email);
      throw error;
    }
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.tx.deleteFrom('users').where('id', '=', id).executeTakeFirst();
    return result.numDeletedRows > 0n;
  }
}
