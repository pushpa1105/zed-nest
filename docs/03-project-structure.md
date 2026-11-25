# 03 · Project structure

```
.
├── src/
│   ├── main.ts                     Bootstrap: logger, setup, graceful shutdown, listen
│   ├── app.module.ts               Composition root: platform modules + FEATURE_MODULES
│   ├── app.setup.ts                HTTP pipeline (security headers, CORS, prefix, versioning, docs), shared with e2e
│   │
│   ├── config/
│   │   ├── env.schema.ts           Zod schema of EVERY env var (coercion, defaults, cross-field rules)
│   │   ├── app-config.ts           AppConfig: typed, frozen, grouped (http, log, database, auth, …)
│   │   └── config.module.ts        Global provider of AppConfig
│   │
│   ├── core/                       Cross-cutting HTTP concerns (Nest-aware, feature-agnostic)
│   │   ├── core.module.ts          Registers throttler guard, validation pipe, timeout, exception filter
│   │   ├── http/
│   │   │   ├── all-exceptions.filter.ts   Every error → RFC 9457 problem+json
│   │   │   ├── problem-details.ts         Error body schema + @ApiProblem() / @ApiProblemResponses()
│   │   │   ├── validation.pipe.ts         Standard Schema (Zod) pipe → ValidationError
│   │   │   ├── timeout.interceptor.ts     Global timeout, @Timeout(ms) override
│   │   │   └── request-id.middleware.ts   X-Request-Id correlation
│   │   ├── security/               @Public(), @Roles(), @CurrentUser()
│   │   └── openapi/
│   │       ├── openapi.ts          OpenAPI document + Scalar API reference at /docs
│   │       └── cli/export-openapi.ts   `pnpm openapi:export`
│   │
│   ├── shared/                     Framework-free kernel (domain code may import this)
│   │   ├── errors/app-error.ts     AppError hierarchy (NotFound, Conflict, Validation, …)
│   │   ├── pagination/             PageRequest, Page<T>, schemas, helpers
│   │   ├── security/               Role, AuthenticatedUser, PasswordHasher port
│   │   └── utils/id.ts             UUIDv7 generator
│   │
│   ├── infrastructure/             Technical adapters
│   │   ├── database/
│   │   │   ├── kysely.factory.ts          ★ the ONLY engine-specific file (dialect)
│   │   │   ├── database-error.translator.ts  ★ driver error codes → AppError
│   │   │   ├── database.schema.ts         Database interface = registry of feature tables
│   │   │   ├── database.module.ts         Pool lifecycle (created at boot, closed on shutdown)
│   │   │   ├── transaction.ts             @InjectDb() + DbTransactionHost for repositories
│   │   │   ├── query-helpers.ts           escapeLike, …
│   │   │   ├── migrator.ts / migration-provider.ts
│   │   │   ├── migrations/                Timestamped migration files
│   │   │   ├── seeds/                     Idempotent seed files
│   │   │   └── cli/                       migrate.ts, seed.ts
│   │   ├── health/                 /health/live, /health/ready, DB indicator
│   │   ├── logger/                 nestjs-pino configuration
│   │   └── security/               Argon2 PasswordHasher, SecurityModule
│   │
│   └── modules/                    ── BUSINESS FEATURES ──
│       ├── index.ts                FEATURE_MODULES registry
│       ├── users/
│       │   ├── domain/
│       │   │   ├── user.ts                 Entity (create / restore / behaviour)
│       │   │   ├── user.repository.ts      PORT (abstract class)
│       │   │   ├── user.errors.ts          UserNotFoundError, UserEmailTakenError, …
│       │   │   └── user.events.ts          UserRegisteredEvent, …
│       │   ├── application/
│       │   │   ├── users.service.ts        Use cases
│       │   │   ├── users.service.spec.ts   Unit tests (in-memory adapter)
│       │   │   └── user-registered.listener.ts
│       │   ├── infrastructure/
│       │   │   ├── users.table.ts          Kysely table type
│       │   │   ├── user.mapper.ts          Row ⇄ entity
│       │   │   └── kysely-user.repository.ts  ADAPTER
│       │   ├── presentation/
│       │   │   ├── users.controller.ts
│       │   │   ├── users.schemas.ts        Zod request/response contracts
│       │   │   └── user.presenter.ts       Entity → response DTO
│       │   ├── testing/                    Test doubles (in-memory repo, fake hasher)
│       │   ├── users.module.ts             Port → adapter binding
│       │   └── index.ts                    Public API of the feature
│       └── auth/                   (same shape)
│
├── test/                           E2E tests (real app + real Postgres)
│   ├── setup/global-setup.ts       Testcontainers Postgres + migrations
│   ├── helpers/test-app.ts         createTestApp(), registerUser(), createAdmin()
│   └── *.e2e-spec.ts
├── scripts/generate-feature.ts     `pnpm gen:feature`
├── docs/                           You are here
├── .github/workflows/ci.yml        Lint, typecheck, tests, dependency audit, e2e, docker build
├── .github/dependabot.yml          Weekly dependency update PRs
├── SECURITY.md                     How to report a vulnerability
├── Dockerfile / docker-compose.yml
├── .oxlintrc.json                  Lint rules + architecture boundaries
├── vitest.config.ts / vitest.config.e2e.ts
└── tsconfig.json / tsconfig.build.json / nest-cli.json
```

## File naming

| Kind            | Pattern                                | Example                           |
| --------------- | -------------------------------------- | --------------------------------- |
| Entity          | `<singular>.ts`                        | `user.ts`                         |
| Port            | `<singular>.repository.ts`             | `user.repository.ts`              |
| Adapter         | `<tech>-<singular>.repository.ts`      | `kysely-user.repository.ts`       |
| Table type      | `<plural>.table.ts`                    | `users.table.ts`                  |
| Service         | `<plural>.service.ts`                  | `users.service.ts`                |
| Controller      | `<plural>.controller.ts`               | `users.controller.ts`             |
| Schemas         | `<plural>.schemas.ts`                  | `users.schemas.ts`                |
| Errors / events | `<singular>.errors.ts` / `.events.ts`  | `user.errors.ts`                  |
| Unit test       | next to the file, `*.spec.ts`          | `users.service.spec.ts`           |
| E2E test        | `test/<feature>.e2e-spec.ts`           | `test/users.e2e-spec.ts`          |
| Migration       | `<UTC yyyymmddHHMMSS>_<snake_name>.ts` | `20261201093000_create_orders.ts` |

## ESM imports

The project is native ESM (`"type": "module"`, `module: nodenext`). Relative imports **must** end in `.js`, even though the source files are `.ts`:

```ts
import { UsersService } from './application/users.service.js'; // ✔
import { UsersService } from './application/users.service'; // ✖ fails at runtime
```

VS Code adds the suffix automatically (see `.vscode/settings.json`).
