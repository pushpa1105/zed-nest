# Zed Nest

A production-grade **NestJS 12** starter for building long-lived backend services.

It gives you a **feature-based** layout, **PostgreSQL** accessed through **Kysely** (a type-safe SQL query builder) behind **repository ports**, **Zod** validation and contracts, **JWT auth** with rotating refresh tokens, **RFC 9457** error responses, a **Scalar** API reference, hardened HTTP defaults, structured logging, health probes, Docker, CI and complete docs.

> **Design goal:** every technology choice lives behind a seam. To change the database engine, edit one file. To change the data-access library, rewrite one adapter per feature. Business code doesn't change in either case.

---

## Quick start

```bash
# prerequisites: Node 24 (see .nvmrc), pnpm 10, Docker
pnpm install
cp .env.example .env
docker compose up -d          # PostgreSQL 18
pnpm db:migrate               # apply migrations
pnpm db:seed                  # create the admin user from SEED_ADMIN_* vars
pnpm start:dev                # http://localhost:3000/api/v1
```

- API reference (Scalar): <http://localhost:3000/docs>
- OpenAPI JSON: <http://localhost:3000/docs/openapi.json>
- Health: `GET /api/health/live`, `GET /api/health/ready`

## What's inside

| Concern                    | Choice                                                                                  | Where                                                     |
| -------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Framework                  | NestJS 12 (ESM), Express 5                                                              | `src/main.ts`, `src/app.module.ts`                        |
| Architecture               | Feature modules × layers (domain / application / infrastructure / presentation)         | `src/modules/*`                                           |
| Database                   | PostgreSQL 18                                                                           | `docker-compose.yml`                                      |
| Data access                | Kysely, `CamelCasePlugin`, repository ports                                             | `src/infrastructure/database`, `modules/*/infrastructure` |
| Transactions               | `@Transactional()` via `@nestjs-cls/transactional` (DB-agnostic)                        | `src/app.module.ts`                                       |
| Migrations / seeds         | Kysely migrator + CLI                                                                   | `pnpm db:*`                                               |
| Validation & API contracts | Zod 4 through Nest's native Standard Schema support                                     | `modules/*/presentation/*.schemas.ts`                     |
| API reference              | Scalar UI on an OpenAPI 3 document generated from the Zod schemas                       | `/docs`, `src/core/openapi`                               |
| Config                     | Zod-validated env → typed, immutable `AppConfig`                                        | `src/config`                                              |
| Auth                       | JWT access token + rotating refresh token with reuse detection, Argon2id                | `src/modules/auth`                                        |
| Sessions                   | Revoked on logout, password change and token reuse; expired ones cleaned up hourly      | `src/modules/auth/application`                            |
| Authorization              | Global guard, secure by default, `@Public()`, `@Roles()`                                | `src/core/security`                                       |
| Errors                     | `AppError` hierarchy → RFC 9457 `application/problem+json`                              | `src/shared/errors`, `src/core/http`                      |
| Logging                    | pino (JSON) with request id correlation and secret redaction                            | `src/infrastructure/logger`                               |
| Security                   | Strict CSP and security headers, `no-store`, CORS allow-list, rate limits, timeouts     | `src/app.setup.ts`, [docs/15](docs/15-security.md)        |
| Events                     | `@nestjs/event-emitter` for decoupled features                                          | `modules/users/domain/user.events.ts`                     |
| Health                     | Terminus liveness and readiness probes                                                  | `src/infrastructure/health`                               |
| Testing                    | Vitest; unit tests with in-memory fakes, e2e with Testcontainers                        | `*.spec.ts`, `test/`                                      |
| Quality                    | oxlint (type-aware, with enforced architecture boundaries), Prettier, Husky, commitlint | `.oxlintrc.json`                                          |
| Delivery                   | Multi-stage Dockerfile (non-root, tini), GitHub Actions, dependency audit, Dependabot   | `Dockerfile`, `.github/`                                  |
| Scaffolding                | `pnpm gen:feature <name>` generates a full CRUD feature                                 | `scripts/generate-feature.ts`                             |

## Project layout (short version)

```
src/
├── main.ts / app.module.ts / app.setup.ts   bootstrap & composition root
├── config/            env schema (Zod) → typed AppConfig
├── core/              cross-cutting HTTP: errors filter, validation, timeouts, auth decorators, API reference
├── shared/            framework-free kernel: errors, pagination, ids, security ports
├── infrastructure/    technical adapters: database, logger, health, security (argon2)
└── modules/           business features, one folder each
    ├── users/
    │   ├── domain/          entity, repository PORT, errors, events      (pure TS)
    │   ├── application/     use-case services                            (no HTTP, no SQL)
    │   ├── infrastructure/  Kysely repository ADAPTER, table type, mapper
    │   ├── presentation/    controller, Zod schemas, presenter
    │   ├── users.module.ts  wiring (port → adapter)
    │   └── index.ts         the feature's public API
    └── auth/
```

Full explanation: [docs/03-project-structure.md](docs/03-project-structure.md).

## Scripts

| Script                                            | What it does                                                  |
| ------------------------------------------------- | ------------------------------------------------------------- |
| `pnpm start:dev`                                  | Run with watch mode                                           |
| `pnpm build` / `pnpm start:prod`                  | Compile to `dist/` / run compiled app                         |
| `pnpm lint` / `pnpm lint:fix`                     | oxlint (type-aware, plus architecture rules)                  |
| `pnpm format` / `pnpm format:check`               | Prettier                                                      |
| `pnpm typecheck`                                  | `tsc --noEmit`                                                |
| `pnpm test` / `pnpm test:watch` / `pnpm test:cov` | Unit tests (Vitest)                                           |
| `pnpm test:e2e`                                   | End-to-end tests against a disposable Postgres (needs Docker) |
| `pnpm validate`                                   | lint + typecheck + test + build, run this before pushing      |
| `pnpm db:migrate`                                 | Apply pending migrations                                      |
| `pnpm db:migrate:status`                          | Show applied/pending migrations                               |
| `pnpm db:migrate:down`                            | Roll back the last migration                                  |
| `pnpm db:migrate:create <name>`                   | New migration file                                            |
| `pnpm db:seed`                                    | Run idempotent seeds                                          |
| `pnpm gen:feature <name>`                         | Scaffold a new feature (CRUD, migration, registration)        |
| `pnpm openapi:export [file]`                      | Write the OpenAPI document to `openapi.json`                  |
| `pnpm audit`                                      | Fail on high or critical advisories in production deps        |

## Documentation

Start at **[docs/README.md](docs/README.md)**. Key guides:

1. [Getting started](docs/01-getting-started.md)
2. [Architecture](docs/02-architecture.md): layers, dependency rule, request lifecycle
3. [Project structure](docs/03-project-structure.md)
4. **[Adding a feature](docs/04-adding-a-feature.md)**: step-by-step
5. **[Database](docs/05-database.md)**: Kysely, migrations, transactions, **switching DB engine or ORM**
6. [Configuration](docs/06-configuration.md)
7. [Validation & API contracts](docs/07-validation-and-api.md)
8. [Error handling](docs/08-error-handling.md)
9. [Authentication & authorization](docs/09-authentication-and-authorization.md)
10. [Logging & observability](docs/10-logging-and-observability.md)
11. [Testing](docs/11-testing.md)
12. [Deployment](docs/12-deployment.md)
13. [Conventions](docs/13-conventions.md)
14. [Recipes](docs/14-recipes.md): Redis, queues, email, outbox, soft delete, cursor pagination, …
15. **[Security](docs/15-security.md)**: what is protected, what is not, pre-launch checklist
16. [Architecture decision records](docs/adr/)

To report a vulnerability, see [SECURITY.md](SECURITY.md).
