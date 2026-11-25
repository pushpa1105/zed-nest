# ADR 0003: Zod via Standard Schema for validation, types and OpenAPI

- **Status:** accepted
- **Date:** 2026-11-25

## Context

NestJS 12 added native [Standard Schema](https://standardschema.dev) support: `@Body({ schema })`, `StandardSchemaValidationPipe`, and OpenAPI conversion of Standard JSON Schema. Before that, the norm was `class-validator` plus `class-transformer` DTO classes, which meant duplicated types, decorator-heavy classes and an under-maintained dependency.

## Decision

Use **Zod 4** for all request and response contracts and for environment validation. One schema gives you runtime validation, the TS type (`z.infer`) and the OpenAPI schema (`.meta({ id })` names components). A global pipe validates any parameter declared with a schema and maps failures to `ValidationError`.

## Alternatives considered

| Option                              | Why not                                                                               |
| ----------------------------------- | ------------------------------------------------------------------------------------- |
| class-validator / class-transformer | Duplication; maintenance concerns; Nest 12 no longer defaults to it                   |
| Valibot / ArkType                   | Also Standard Schema compliant and could be swapped in; Zod has the largest ecosystem |

## Consequences

- Each parameter must declare `{ schema }`, otherwise it isn't validated (reviewers check this).
- Other Standard Schema libraries can be used where they're a better fit, because the pipe is library-agnostic.
