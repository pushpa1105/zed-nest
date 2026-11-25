import { InjectTransactionHost, type TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterKysely } from '@nestjs-cls/transactional-adapter-kysely';
import type { Database } from './database.schema.js';

/**
 * The database handle every repository uses.
 *
 *   constructor(@InjectDb() private readonly db: DbTransactionHost) {}
 *   ...
 *   this.db.tx.selectFrom('users')...
 *
 * `db.tx` is the active transaction when called inside a `@Transactional()`
 * method (anywhere up the call stack), otherwise the root Kysely instance.
 * Repositories therefore never know — or care — whether they run in a transaction.
 */
export type DbTransactionHost = TransactionHost<TransactionalAdapterKysely<Database>>;

/** Explicit injection decorator (type aliases carry no runtime metadata). */
export const InjectDb = (): ParameterDecorator & PropertyDecorator => InjectTransactionHost();
