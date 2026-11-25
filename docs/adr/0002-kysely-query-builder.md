# ADR 0002: Kysely (type-safe query builder) instead of an ORM

- **Status:** accepted
- **Date:** 2026-11-25

## Context

We need type-safe data access to PostgreSQL that:

- keeps SQL visible and predictable (performance, reviewability),
- doesn't leak into domain objects,
- can target other engines later,
- integrates with NestJS transactions.

## Decision

Use **Kysely**, with:

- table types per feature, registered in one `Database` interface,
- `CamelCasePlugin` (camelCase in TypeScript, snake_case in SQL),
- the Kysely migrator for migrations,
- `@nestjs-cls/transactional` with the Kysely adapter, giving declarative `@Transactional()`.

Kysely is used **only in infrastructure adapters**. Domain and application code depend on repository ports.

## Alternatives considered

| Option          | Pros                               | Cons                                                                                                                            |
| --------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Prisma**      | Great DX, schema-first, migrations | Generated client and engine; its types become your domain if you're not careful; complex SQL needs raw queries; heavier runtime |
| **Drizzle ORM** | SQL-like, light, popular           | Schema defined in its DSL; younger API surface. Also a good choice and fits the same ports.                                     |
| **TypeORM**     | Familiar in the Nest world         | Decorator entities couple domain to the ORM; inconsistent typing; slow to evolve                                                |
| **MikroORM**    | Unit of work, identity map         | Heavier mental model; ORM-shaped domain                                                                                         |
| **Raw `pg`**    | Zero abstraction                   | No type safety; manual mapping everywhere                                                                                       |

## Consequences

- You write SQL-shaped code. That needs SQL knowledge, but there are no surprises.
- Table types are written by hand (or generated with `kysely-codegen`) and must be kept in sync with migrations.
- Changing the engine is a dialect plus error-translator change. Changing the library is an adapter rewrite per feature plus a transactional adapter swap. See docs/05-database.md.
