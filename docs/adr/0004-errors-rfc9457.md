# ADR 0004: Transport-agnostic AppErrors rendered as RFC 9457 Problem Details

- **Status:** accepted
- **Date:** 2026-11-25

## Context

Throwing `HttpException` from services couples business logic to HTTP. Inconsistent error bodies make client error handling fragile.

## Decision

- Business code throws `AppError` subclasses, each with a `kind` (category), a stable `code` and optional `details`.
- One global `AllExceptionsFilter` maps `kind` → HTTP status. It also translates DB driver errors and Nest's own `HttpException`s.
- Every error response is `application/problem+json` per RFC 9457, extended with `code` and `requestId`.
- Unknown errors become a generic 500. Details are logged, never returned to the client.

## Consequences

- Clients branch on `code`, a stable contract. Error codes need the same care as API fields.
- Services work unchanged from queues, CLIs or other transports.
