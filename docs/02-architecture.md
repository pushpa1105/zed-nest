# 02 · Architecture

The codebase is a **modular monolith**. It is split vertically into **features** (users, auth, orders, …). Each feature is split horizontally into **layers**, following ports & adapters (also called hexagonal or clean architecture). The goal is that each kind of change touches one predictable place.

| When you change…                                     | You touch…                                                                     |
| ---------------------------------------------------- | ------------------------------------------------------------------------------ |
| A business rule                                      | `modules/<feature>/domain` or `application`                                    |
| An endpoint shape                                    | `modules/<feature>/presentation`                                               |
| A query or table                                     | `modules/<feature>/infrastructure` and a migration                             |
| The database engine                                  | `infrastructure/database/kysely.factory.ts` and `database-error.translator.ts` |
| The data-access library (Kysely → Prisma or Drizzle) | each feature's `infrastructure/` adapter, plus one line in `app.module.ts`     |
| Cross-cutting HTTP behaviour                         | `core/`                                                                        |

## Layers inside a feature

```
              ┌────────────────────────────────────────────┐
  HTTP ──────▶│ presentation   controller · Zod schemas ·  │
              │                presenter                   │
              └───────────────┬────────────────────────────┘
                              │ calls
              ┌───────────────▼────────────────────────────┐
              │ application    services (use cases)        │
              │                @Transactional() boundaries │
              └───────────────┬────────────────────────────┘
                              │ uses
              ┌───────────────▼────────────────────────────┐
              │ domain         entities · repository PORTS │◀──── implements ───┐
              │                errors · events             │                    │
              └────────────────────────────────────────────┘                    │
              ┌────────────────────────────────────────────┐                    │
  SQL ◀──────│ infrastructure Kysely repository ADAPTER ·  │────────────────────┘
              │                table types · mappers       │
              └────────────────────────────────────────────┘
```

| Layer                     | Contains                                                                          | May import                                                                              | Must NOT import                           |
| ------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------- |
| **domain**                | Entities, value logic, repository ports (abstract classes), domain errors, events | `shared/`                                                                               | `@nestjs/*`, `kysely`, `pg`, other layers |
| **application**           | Services orchestrating use cases                                                  | domain, `shared/`, `@nestjs/common`, transactions decorator, other features' `index.ts` | `kysely`, `pg`, any `infrastructure/`     |
| **infrastructure**        | Port implementations (Kysely), table types, mappers                               | domain, `infrastructure/database`                                                       | presentation                              |
| **presentation**          | Controllers, Zod request/response schemas, presenters                             | application, domain types, `core/`                                                      | `kysely`, `pg`, any `infrastructure/`     |
| **`<feature>.module.ts`** | Wiring: binds each port to an adapter                                             | everything in the feature                                                               | –                                         |

### Dependency rule

Dependencies point **inward**, toward the domain. The domain knows nothing about Nest, HTTP or SQL, so it is trivial to test and it survives framework or database changes.

The rule is **enforced by the linter** (`.oxlintrc.json` → `no-restricted-imports` overrides). Two examples:

```ts
// src/modules/users/application/users.service.ts
import { sql } from 'kysely';
// ✖ error: Application/presentation layers talk to persistence only through repository ports

// src/modules/users/domain/user.ts
import { Injectable } from '@nestjs/common';
// ✖ error: Domain/shared code must stay framework- and persistence-agnostic
```

## Ports and adapters (why the DB is swappable)

```ts
// domain: the port. An abstract class, so it doubles as the Nest DI token.
export abstract class UserRepository {
  abstract findById(id: string): Promise<User | null>;
}

// infrastructure: the adapter
@Injectable()
export class KyselyUserRepository extends UserRepository { /* SQL here */ }

// users.module.ts: the only place that chooses the adapter
{ provide: UserRepository, useClass: KyselyUserRepository }

// application: depends on the port only
constructor(private readonly users: UserRepository) {}
```

To swap Kysely for Prisma or Drizzle, write `PrismaUserRepository` and change `useClass`. Services, controllers and tests stay the same. Unit tests use `InMemoryUserRepository`, which is the same seam.

## Top-level folders

| Folder            | Role                                                                                                                                 | Knows about features?                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| `config/`         | Env validation and typed `AppConfig`                                                                                                 | No                                                     |
| `shared/`         | Framework-free kernel: `AppError`s, pagination, `generateId`, security ports                                                         | No                                                     |
| `core/`           | Nest-specific cross-cutting HTTP: exception filter, validation pipe, timeout, request id, `@Public`/`@Roles`/`@CurrentUser`, OpenAPI | No                                                     |
| `infrastructure/` | Technical capabilities: DB connection, migrations, transactions, logger, health, password hashing                                    | Only `database.schema.ts`, which registers table types |
| `modules/`        | Business features                                                                                                                    | –                                                      |

## Request lifecycle

```
request
  │
  ├─ requestIdMiddleware      assigns/propagates X-Request-Id          (core/http)
  ├─ helmet (CSP, HSTS) · no-store · compression · CORS · body limit   (app.setup.ts)
  ├─ pino-http                 one structured log line per request     (infrastructure/logger)
  ├─ ClsMiddleware             async context (request id, transaction)
  ├─ ThrottlerGuard            rate limit                              (core)
  ├─ AuthGuard                 JWT → req.user, @Public / @Roles        (modules/auth)
  ├─ TimeoutInterceptor        408 after REQUEST_TIMEOUT_MS            (core)
  ├─ Validation pipe           Zod schemas on @Body/@Query/@Param      (core)
  ├─ Controller → Service → Repository → PostgreSQL
  │
  └─ AllExceptionsFilter       any error → RFC 9457 problem+json       (core)
```

## Cross-feature communication

You have three options. Prefer them in this order:

1. **Events** (looser coupling). The publisher doesn't know its subscribers.
   ```ts
   this.events.emit(UserRegisteredEvent.NAME, new UserRegisteredEvent(...));
   @OnEvent(UserRegisteredEvent.NAME) handle(e: UserRegisteredEvent) {}
   ```
2. **Calling another feature's exported service**, imported from its `index.ts`. Example: `AuthService` uses `UsersService`.
3. **Never** reach into another feature's internals, such as `../users/infrastructure/...`. Never query another feature's tables either. If you need that data, ask the owning feature's service.

Following these rules keeps each feature extractable into its own service later.

## Transactions

`@Transactional()` on an application-service method opens a transaction. Every repository call underneath joins it automatically, including calls in other features' services. This works through `AsyncLocalStorage` (nestjs-cls), so no transaction object is passed around. See [05 – Database](05-database.md#transactions).

## Why not …?

| Alternative                                           | Why not here                                                                                                   |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Layer-first folders (`controllers/`, `services/`, …)  | Changes spread across the whole tree, and you can't see what the app _does_. Features don't scale that way.    |
| Full DDD (aggregates, value objects everywhere, CQRS) | Too much ceremony for most features. Adopt it per feature when the domain is complex. The structure allows it. |
| Microservices from day one                            | Distributed-systems cost before it's needed. The modular monolith keeps that option open.                      |
| A generic `BaseRepository<T>`                         | It leaks persistence concerns, and most features need specific queries. Ports stay explicit and small.         |
| An ORM entity as the domain model                     | It ties business logic to the ORM. Our entities are plain classes and mappers translate.                       |

See the [ADRs](adr/) for the recorded decisions.
