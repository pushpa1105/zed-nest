# 10 · Logging & observability

## Logging

[pino](https://getpino.io) via `nestjs-pino`. It writes JSON in production and pretty output in development (`LOG_PRETTY=true`).

```ts
import { Logger } from '@nestjs/common';

export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  async pay(orderId: string) {
    this.logger.log({ orderId, amount }, 'Order paid'); // object first, message second
    this.logger.warn({ orderId }, 'Payment retried');
    this.logger.error({ err, orderId }, 'Payment failed'); // `err` key → serialised stack
  }
}
```

Every log line written during a request automatically includes the request context (`req.id`):

```json
{"level":30,"time":…,"req":{"id":"4bf2…","method":"POST","url":"/api/v1/orders"},"context":"OrdersService","orderId":"…","msg":"Order paid"}
```

### Rules

- **Structured fields, not string interpolation**: `logger.log({ orderId }, 'Order paid')`, not `` `Order ${id} paid` ``. Fields are searchable.
- **Never log secrets or personal data.** The logger redacts `authorization` and `cookie` headers and any `password`, `accessToken` or `refreshToken` field. Extend the `redact.paths` list in `infrastructure/logger/logger.module.ts` for your own sensitive fields.
- Levels: `error` = someone must act · `warn` = unexpected but handled · `info` (`log`) = business events · `debug` = diagnostics.
- Health-check requests are excluded from request logs.

## Request correlation

`X-Request-Id` is generated per request, or taken from an upstream proxy if the value is safe. It is:

- returned in the response header,
- attached to every log line of the request,
- available in the CLS context (`ClsService.getId()`) anywhere in the call chain,
- included in error bodies as `requestId`.

When you call other services, forward it:

```ts
fetch(url, { headers: { 'x-request-id': this.cls.getId() } });
```

## Health checks

| Endpoint                | Purpose                                       | Checks                                                  |
| ----------------------- | --------------------------------------------- | ------------------------------------------------------- |
| `GET /api/health/live`  | Liveness: should the orchestrator restart me? | Nothing external. A DB blip must not restart every pod. |
| `GET /api/health/ready` | Readiness: should I receive traffic?          | Database round-trip (with latency)                      |

To add a dependency (Redis, an external API), write an indicator like `infrastructure/health/database.health.ts` and add it to `ready()`.

## Metrics & tracing (recommended next steps)

The starter doesn't ship a metrics or tracing backend, because that choice is platform-specific. The standard path is **OpenTelemetry**:

```bash
pnpm add @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node @opentelemetry/exporter-trace-otlp-http
```

```ts
// src/instrumentation.ts: must load BEFORE the app
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

new NodeSDK({
  serviceName: 'zed-nest',
  traceExporter: new OTLPTraceExporter(), // OTEL_EXPORTER_OTLP_ENDPOINT
  instrumentations: [getNodeAutoInstrumentations()], // http, express, pg, …
}).start();
```

```bash
node --import ./dist/instrumentation.js dist/main.js
```

This gives you distributed traces across HTTP and Postgres. Pino can add `trace_id` to logs via `pino-opentelemetry-transport` or a mixin. Nest 12 also ships an official `@nestjs/observe` package, which is worth evaluating.

For Prometheus-style metrics, add `@willsoto/nestjs-prometheus` or use OpenTelemetry metrics. The golden signals to track are request rate, error rate, latency (p50/p95/p99) and DB pool saturation.

## Alerting suggestions

- 5xx rate > 1% over 5 minutes
- p95 latency above your SLO
- readiness failing on more than N pods
- log `warn` "Refresh token reuse detected" above baseline (possible token theft)
