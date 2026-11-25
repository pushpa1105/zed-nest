# ADR 0001: Feature-based modular monolith with ports & adapters

- **Status:** accepted
- **Date:** 2026-11-25

## Context

The service will grow for years, with many contributors. We need to be able to find code quickly, change things in isolation, test without heavy infrastructure, and keep the option to replace infrastructure (database, data-access library, providers) or split out services later.

## Decision

- Organise code **by feature** (`src/modules/<feature>`), not by technical type.
- Inside each feature, use four layers (**domain, application, infrastructure, presentation**) with dependencies pointing inward.
- Persistence and external systems sit behind **ports** (abstract classes used as Nest DI tokens). Each feature's module binds a port to an adapter.
- Features talk to each other only through their `index.ts` public API or through events.
- Enforce layer boundaries with lint rules (`no-restricted-imports` overrides in `.oxlintrc.json`).

## Alternatives considered

| Option                     | Why not                                                                      |
| -------------------------- | ---------------------------------------------------------------------------- |
| Layer-first folders        | Changes scatter; doesn't scale past a few features                           |
| Full DDD + CQRS everywhere | Ceremony that most CRUD-ish features don't need. Can be adopted per feature. |
| Microservices now          | Operational and distributed-systems cost before it's justified               |

## Consequences

- More files per feature than a "controller + service" setup. The generator (`pnpm gen:feature`) offsets this.
- Unit tests run without a DB (in-memory adapters).
- Swapping persistence is a per-feature adapter rewrite with no business-code changes.
