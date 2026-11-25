# 08 · Error handling

## The model

```
domain/application code ──throw──▶ AppError subclass (kind + code + details)
                                         │
DB driver error ──────────────────────▶  │  translateDatabaseError()
Nest HttpException (404 route, 429…) ─▶  │
unknown error ────────────────────────▶  │
                                         ▼
                        AllExceptionsFilter (core/http)  ← the ONLY place that knows HTTP status codes
                                         │
                                         ▼
                     RFC 9457 application/problem+json + log line (with requestId)
```

**Business code never throws `HttpException`.** Services are reused by queues, CLIs, cron jobs and other features, where an HTTP status means nothing.

## Error classes (`src/shared/errors/app-error.ts`)

| Class                     | `kind`        | HTTP | Use for                                                    |
| ------------------------- | ------------- | ---- | ---------------------------------------------------------- |
| `ValidationError`         | validation    | 400  | Input shape errors (thrown by the validation pipe)         |
| `BadRequestError`         | bad_request   | 400  | Malformed requests not caught by schemas                   |
| `UnauthorizedError`       | unauthorized  | 401  | Not authenticated or bad credentials                       |
| `ForbiddenError`          | forbidden     | 403  | Authenticated but not allowed                              |
| `NotFoundError`           | not_found     | 404  | Missing resource                                           |
| `ConflictError`           | conflict      | 409  | Duplicates, version conflicts                              |
| `BusinessRuleError`       | unprocessable | 422  | Valid input that breaks a business rule                    |
| `ServiceUnavailableError` | unavailable   | 503  | Dependency down or overloaded                              |
| anything else             | –             | 500  | Bugs. The client gets no details; the full error is logged |

## Defining feature errors

Subclass the matching base and give it a **stable `code`**:

```ts
// modules/orders/domain/order.errors.ts
export class OrderAlreadyPaidError extends BusinessRuleError {
  constructor(orderId: string) {
    super(`Order ${orderId} is already paid`, 'ORDER_ALREADY_PAID');
  }
}

export class InsufficientStockError extends ConflictError {
  constructor(productId: string, available: number) {
    super('Not enough stock', 'INSUFFICIENT_STOCK', [
      { path: 'items', message: `Only ${available} left`, productId, available },
    ]);
  }
}
```

Conventions:

- `code` is `SCREAMING_SNAKE_CASE` and prefixed with the feature: `ORDER_…`, `USER_…`.
- **Codes are part of the public API.** Clients branch on them. Never rename a published code.
- `detail` (the message) is for humans and can change.
- Put only client-safe data in `details`.

## Response format

```json
{
  "type": "urn:problem-type:order-already-paid",
  "title": "Unprocessable Entity",
  "status": 422,
  "detail": "Order 01HZ… is already paid",
  "instance": "/api/v1/orders/01HZ…/pay",
  "code": "ORDER_ALREADY_PAID",
  "requestId": "4bf2a1…",
  "errors": [ … ]          // optional field-level details
}
```

Every response, success or error, has an `X-Request-Id` header, and errors repeat it as `requestId`. Ask users to quote it in bug reports: one log search then shows the whole request.

`instance` is the request path without the query string, so query parameters are never echoed back or logged through errors.

Document each error an endpoint can return with `@ApiProblem(status, code)` so it shows up in the API reference (see [07](07-validation-and-api.md#documenting-an-endpoint)).

## Logging behaviour

- Status ≥ 500 is logged at `error` with the full error and stack.
- Status < 500 is logged at `debug` (expected client errors shouldn't page anyone).

## Adding a new error kind

Rarely needed. If you do need one, add the kind to `ErrorKind`, add a base class, and map it in `STATUS_BY_KIND` in `all-exceptions.filter.ts`. TypeScript fails to compile until the mapping exists.

## Non-HTTP contexts

The filter only handles HTTP. For queue consumers or cron jobs, catch errors at the job boundary and log them. Use `AppError.code` to decide whether to retry. As a rule, `unavailable` errors are retryable and `validation`/`conflict` errors are not.
