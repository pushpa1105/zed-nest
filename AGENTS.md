# AGENTS.md

Guidance for AI coding agents (and humans) working in this repository.

## Stack

NestJS 12 (ESM) · TypeScript 6 · PostgreSQL · Kysely · Zod 4 (Standard Schema) · Vitest · oxlint · pnpm

## Commands

- `pnpm validate`: lint + typecheck + unit tests + build. **Run it before declaring work done.**
- `pnpm test:e2e`: e2e tests against a disposable Postgres (needs Docker)
- `pnpm gen:feature <name>`: scaffold a feature. Prefer this over hand-writing the boilerplate.
- `pnpm db:migrate:create <snake_name>` / `pnpm db:migrate`
- `pnpm openapi:export`: write the OpenAPI document to `openapi.json`

## Hard rules

1. Relative imports end in `.js` (native ESM).
2. Feature code lives in `src/modules/<feature>/{domain,application,infrastructure,presentation}`. Follow `src/modules/users` as the reference.
3. `domain/` imports nothing from `@nestjs/*`, `kysely`, `pg` or other layers. `application/` and `presentation/` never import `kysely`, `pg` or any `infrastructure/`. The linter enforces this.
4. SQL lives only in `modules/*/infrastructure/kysely-*.repository.ts`. Always query through `this.db.tx`.
5. Throw `AppError` subclasses (`src/shared/errors`) with a stable `FEATURE_REASON` code. Never throw `HttpException` from services.
6. Validate every `@Body`/`@Query`/`@Param` with `{ schema: zodSchema }`. Document every endpoint: `@ApiOperation({ summary })`, the success response with `standardSchema`, and each client-facing error with `@ApiProblem(status, code)`.
7. Return presenter output (`toXResponse`), never entities or rows.
8. Read configuration through the injected `AppConfig`, never `process.env`.
9. Routes are authenticated by default. Use `@Public()` or `@Roles()` deliberately.
10. Import another feature only via its `index.ts`.
11. New table → migration, table type in `database.schema.ts`, and add it to `reset()` in `test/helpers/test-app.ts`.
12. Never edit an already-applied migration. Create a new one.
13. Don't weaken the security defaults in `src/app.setup.ts` (CSP, `no-store`, CORS rules) or the checks in `src/config/env.schema.ts` without an ADR. `test/http-pipeline.e2e-spec.ts` guards them.

## Docs

Start with `docs/README.md`. Architecture is in `docs/02-architecture.md`, the feature how-to in `docs/04-adding-a-feature.md`, database topics in `docs/05-database.md`, the API reference (Scalar/OpenAPI) in `docs/07-validation-and-api.md`, and the security model in `docs/15-security.md`.
