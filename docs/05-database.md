# 05 · Database

**Stack:** PostgreSQL 18 · [Kysely](https://kysely.dev) (type-safe SQL query builder) · `pg` driver · `@nestjs-cls/transactional` for transactions.

Why Kysely and not an ORM? See [ADR 0002](adr/0002-kysely-query-builder.md). In short: you write SQL-shaped code with full type safety, there's no hidden query generation and no entity/ORM coupling, and it supports many dialects.

## How the pieces fit

```
Service ──▶ UserRepository (port, domain)
                 ▲
                 │ implements
        KyselyUserRepository ──▶ this.db.tx  ──▶ Kysely<Database> ──▶ Dialect (Postgres) ──▶ pg Pool
            (infrastructure)        │
                                    └─ TransactionHost: the active transaction or the root instance
```

| File                                                   | Responsibility                                                             |
| ------------------------------------------------------ | -------------------------------------------------------------------------- |
| `infrastructure/database/kysely.factory.ts`            | Builds `Kysely<Database>`: dialect, pool, `CamelCasePlugin`, query logging |
| `infrastructure/database/database.schema.ts`           | `Database` interface that registers each feature's table types             |
| `infrastructure/database/database.module.ts`           | Provides the `DATABASE` token and closes the pool on shutdown              |
| `infrastructure/database/transaction.ts`               | `@InjectDb()` and the `DbTransactionHost` type for repositories            |
| `infrastructure/database/database-error.translator.ts` | Postgres error codes → `AppError` (unique → 409, …)                        |
| `modules/*/infrastructure/*.table.ts`                  | Table types (owned by each feature)                                        |
| `modules/*/infrastructure/kysely-*.repository.ts`      | All SQL of a feature                                                       |

## Writing queries

```ts
@Injectable()
export class KyselyOrderRepository extends OrderRepository {
  constructor(@InjectDb() private readonly db: DbTransactionHost) {
    super();
  }

  findOpenForUser(userId: string) {
    return this.db.tx
      .selectFrom('orders')
      .innerJoin('orderItems', 'orderItems.orderId', 'orders.id')
      .select([
        'orders.id',
        'orders.status',
        (eb) => eb.fn.sum<number>('orderItems.priceCents').as('total'),
      ])
      .where('orders.userId', '=', userId)
      .where('orders.status', '=', 'open')
      .groupBy('orders.id')
      .execute();
  }
}
```

- TypeScript identifiers are **camelCase**. `CamelCasePlugin` converts them to `snake_case` in SQL (`orderItems` → `order_items`, `userId` → `user_id`).
- Use `this.db.tx`, never an injected root `Kysely`. The call then joins the current transaction automatically.
- Raw SQL when you need it: ``sql<number>`select count(*) from ${sql.table('users')}`.execute(this.db.tx)``. Values are always parameterised.
- `count(*)` comes back from `pg` as a **string** (bigint). Convert it with `Number(...)`.
- Use `escapeLike()` for user input in `LIKE`/`ILIKE` patterns.
- Map rows to entities with a mapper. Never return rows from a repository.

### Column types

```ts
export interface OrdersTable {
  id: string;
  status: 'open' | 'paid' | 'cancelled';
  note: string | null; // nullable column
  createdAt: ColumnType<Date, Date | undefined, never>; // select Date, insert optional, never update
  updatedAt: ColumnType<Date, Date | undefined, Date>;
  sequence: Generated<number>; // DB-generated (serial/identity)
}
```

**Optional:** generate table types from a live database with [`kysely-codegen`](https://github.com/RobinBlomberg/kysely-codegen) instead of writing them by hand.

## Migrations

```bash
pnpm db:migrate:create add_status_to_orders   # new file in infrastructure/database/migrations
pnpm db:migrate                               # apply all pending
pnpm db:migrate:status                        # list applied / pending
pnpm db:migrate:up | db:migrate:down          # one step forward / back
```

Rules:

1. **Never edit or rename a migration that has been applied** anywhere shared (staging or prod). Write a new one instead.
2. Write `snake_case` identifiers and type the parameter as `Kysely<any>`. Migrations are a historical record and must not import app types that change over time.
3. Always implement `down()`.
4. Make changes backwards-compatible with the running version (expand → migrate data → contract), because old and new pods run at the same time during a rolling deploy:
   - Add a column as nullable or with a default → deploy code that writes it → backfill → add `NOT NULL` in a later migration.
   - Don't rename columns in one step. Add the new column, dual-write, then drop the old one later.
5. On big tables, create indexes concurrently: ``await sql`create index concurrently ...`.execute(db)``. This can't run inside a transaction, so put it in its own migration.
6. `allowUnorderedMigrations` is on, so migrations from branches merged out of order still run.

Production runs migrations as a **separate step before** the new version starts (see [12 – Deployment](12-deployment.md)):

```bash
node dist/infrastructure/database/cli/migrate.js latest
```

## Seeds

`pnpm db:seed` runs every file in `infrastructure/database/seeds/` in name order. Seeds must be **idempotent** (check before insert). Use them for reference data and the bootstrap admin. Don't use them for test data.

## Transactions

```ts
import { Transactional } from '@nestjs-cls/transactional';

@Injectable()
export class CheckoutService {
  constructor(
    private readonly orders: OrdersService,
    private readonly stock: StockService,
  ) {}

  @Transactional() // BEGIN … COMMIT, or ROLLBACK on throw
  async checkout(cartId: string) {
    const order = await this.orders.createFromCart(cartId); // joins the tx
    await this.stock.reserve(order.items); // joins the tx, even in another feature
    return order;
  }
}
```

- Put `@Transactional()` on **application-service** methods, never on repositories or controllers.
- It is **library-agnostic**. The decorator comes from `@nestjs-cls/transactional`, not from Kysely. Switching to Prisma or Drizzle changes only the adapter registered in `app.module.ts`.
- Options: `@Transactional({ isolationLevel: 'serializable' })`. Propagation: `@Transactional(Propagation.RequiresNew)` and others.
- Throwing rolls back. If something must persist even though you then throw (like the refresh-token reuse revocation in `AuthService.refresh`), don't wrap it in a transaction.
- Events emitted inside a transaction fire **before** commit. If a listener must only run for committed data, use the outbox pattern ([14 – Recipes](14-recipes.md#transactional-outbox)).
- The e2e test `auth.e2e-spec.ts → transactions` proves the rollback.

## Error handling

Driver errors that bubble up are translated by `database-error.translator.ts`:

| Postgres code             | Meaning                                  | HTTP                        |
| ------------------------- | ---------------------------------------- | --------------------------- |
| `23505`                   | unique violation                         | 409 `UNIQUE_VIOLATION`      |
| `23503`                   | foreign-key violation                    | 409 `FOREIGN_KEY_VIOLATION` |
| `23502`, `23514`, `22P02` | not-null / check / bad input             | 400 `INVALID_DATA`          |
| `57014`, `53300`          | statement timeout / too many connections | 503 `DATABASE_BUSY`         |
| `ECONNREFUSED`, …         | DB unreachable                           | 503 `DATABASE_UNAVAILABLE`  |

Prefer translating expected violations **in the repository** into domain errors, as `KyselyUserRepository.insert` does:

```ts
catch (error) {
  if (isUniqueViolation(error, 'users_email_key')) throw new UserEmailTakenError(user.email);
  throw error;
}
```

## Connection settings

| Env                       | Default | Notes                                                                                          |
| ------------------------- | ------- | ---------------------------------------------------------------------------------------------- |
| `DATABASE_URL`            | –       | `postgres://user:pass@host:5432/db`                                                            |
| `DB_POOL_MAX`             | 10      | Per instance. Total = replicas × pool. Stay under Postgres `max_connections` or use PgBouncer. |
| `DB_SSL`                  | false   | `true` in managed clouds (RDS, Cloud SQL, Azure, …)                                            |
| `DB_STATEMENT_TIMEOUT_MS` | 10000   | Kills runaway queries server-side. `0` disables it.                                            |
| `DB_LOG_QUERIES`          | false   | Logs every SQL statement at debug level                                                        |

---

## Switching the database engine

_Example: PostgreSQL → MySQL._ Kysely has dialects for PostgreSQL, MySQL, SQLite and MSSQL. Community dialects cover PlanetScale, Neon, D1, LibSQL, Oracle and more.

| Step | File                                                   | Change                                                                                                                                                       |
| ---- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | `package.json`                                         | `pnpm add mysql2` (and remove `pg` if no longer needed)                                                                                                      |
| 2    | `config/env.schema.ts`                                 | `DB_CLIENT: z.enum(['postgres', 'mysql'])`                                                                                                                   |
| 3    | `infrastructure/database/kysely.factory.ts`            | Add `case 'mysql': return new MysqlDialect({ pool: createPool({ uri: config.url, connectionLimit: config.poolMax }) })`                                      |
| 4    | `infrastructure/database/database-error.translator.ts` | Map MySQL codes (`ER_DUP_ENTRY` = 1062, `ER_NO_REFERENCED_ROW_2` = 1452, …). Update `isUniqueViolation`                                                      |
| 5    | Migrations                                             | Postgres-specific types (`timestamptz`, `uuid`) → MySQL equivalents (`datetime(3)`, `char(36)`). Usually you start a fresh migration set for the new engine. |
| 6    | Repositories                                           | Grep for Postgres-only syntax: `ilike` (→ `like` with a case-insensitive collation), `returning` (MySQL has none), `distinctOn`, JSON operators.             |
| 7    | Test setup                                             | `test/setup/global-setup.ts`: use `MySqlContainer` from `@testcontainers/mysql`                                                                              |
| 8    | `docker-compose.yml`                                   | Swap the service image                                                                                                                                       |

**Not touched:** domain, application services, controllers, schemas, unit tests, auth, error handling, `@Transactional()` call sites.

To find Postgres-specific code quickly:

```bash
grep -rnE "ilike|returning|distinctOn|::|jsonb|timestamptz" src/modules/*/infrastructure src/infrastructure/database/migrations
```

## Switching the data-access library (Kysely → Prisma, Drizzle or TypeORM)

The application depends on **repository ports**, and transactions are managed by a library-agnostic plugin. That makes the change mechanical:

1. **Install** the library and its transactional adapter. Adapters exist for `@nestjs-cls/transactional-adapter-prisma`, `-drizzle-orm`, `-typeorm`, `-knex`, `-pg-promise` and more.
2. **Provide the client** in `DatabaseModule` (for example, a `PrismaClient` under a token).
3. **Swap the adapter** in `app.module.ts`:
   ```ts
   new ClsPluginTransactional({
     imports: [DatabaseModule],
     adapter: new TransactionalAdapterPrisma({ prismaInjectionToken: PRISMA }),
   });
   ```
4. **Per feature**, write a new adapter that implements the same port:
   ```ts
   @Injectable()
   export class PrismaUserRepository extends UserRepository {
     constructor(private readonly txHost: TransactionHost<TransactionalAdapterPrisma>) {
       super();
     }
     async findById(id: string) {
       const row = await this.txHost.tx.user.findUnique({ where: { id } });
       return row ? UserMapper.toDomain(row) : null;
     }
   }
   ```
   and change one line in `users.module.ts`: `{ provide: UserRepository, useClass: PrismaUserRepository }`.
5. **Migrations:** either keep the Kysely migrator (it works independently of the query library) or move to the new tool's migrations.

You can migrate **one feature at a time**. Both adapters can coexist while you do it.

**Not touched:** every service, controller, entity, schema, unit test, e2e test and `@Transactional()` usage.

## Read replicas / multiple databases

Register a second Kysely instance under another token, such as `READ_DATABASE`. Then either inject it into read-heavy repositories, or register a second `ClsPluginTransactional` with a `connectionName` and use `@InjectTransactionHost('read')`.
