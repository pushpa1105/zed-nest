# 14 · Recipes

Each recipe is a common extension, written so it fits the architecture. Rule of thumb: **put a port in the owning feature (or `shared/`), the adapter in `infrastructure/`, and bind them in a module.**

- [Redis cache](#redis-cache)
- [Redis-backed rate limiting](#redis-backed-rate-limiting)
- [Background jobs (BullMQ)](#background-jobs-bullmq)
- [Scheduled jobs](#scheduled-jobs)
- [Sending email](#sending-email)
- [Transactional outbox](#transactional-outbox)
- [Soft delete](#soft-delete)
- [Cursor pagination](#cursor-pagination)
- [Optimistic locking](#optimistic-locking)
- [File uploads](#file-uploads)
- [Refresh token in an HttpOnly cookie](#refresh-token-in-an-httponly-cookie)
- [Calling external HTTP APIs](#calling-external-http-apis)
- [Multi-tenancy](#multi-tenancy)

---

## Redis cache

```bash
pnpm add ioredis
```

1. Add `REDIS_URL` to the env schema and to `AppConfig` ([06](06-configuration.md#adding-a-variable)).
2. Define a port in `shared/cache/cache.port.ts`:
   ```ts
   export abstract class Cache {
     abstract get<T>(key: string): Promise<T | undefined>;
     abstract set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
     abstract del(key: string): Promise<void>;
   }
   ```
3. Write the adapter `infrastructure/cache/redis-cache.ts`, register it in a global `CacheModule` (`{ provide: Cache, useClass: RedisCache }`), and close the connection in `onApplicationShutdown`.
4. Add a Redis health indicator to `/health/ready`.
5. Add `redis:7-alpine` to `docker-compose.yml`.
6. Use it in services (cache-aside):
   ```ts
   const cached = await this.cache.get<ProductResponse>(`product:${id}`);
   ```
   Invalidate on write. Unit tests get an in-memory `Cache`.

## Redis-backed rate limiting

With several replicas, use shared throttler storage:

```bash
pnpm add @nest-lab/throttler-storage-redis
```

```ts
// core/core.module.ts → ThrottlerModule.forRootAsync useFactory
storage: new ThrottlerStorageRedisService(config.redis.url),
```

## Background jobs (BullMQ)

```bash
pnpm add @nestjs/bullmq bullmq
```

- Register `BullModule.forRootAsync` (Redis connection) once in a platform module.
- In the feature: `BullModule.registerQueue({ name: 'emails' })`, a producer in the application service (`this.queue.add('welcome', { userId })`), and a processor class (`@Processor('emails')`).
- Processors call **application services**, the same use cases HTTP calls. Never put business logic in a processor.
- Make jobs **idempotent** (they can run twice) and use `AppError.kind` to decide on retries.

## Scheduled jobs

The starter already ships one periodic task without any dependency: `SessionCleanupService` (`modules/auth/application`) deletes expired sessions hourly with an unref'd `setInterval`. That pattern is enough for idempotent housekeeping that may run on every replica.

For cron expressions, or jobs that must run once across replicas:

```bash
pnpm add @nestjs/schedule
```

```ts
@Injectable()
export class DailyReportJob {
  constructor(private readonly reports: ReportsService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async run() {
    await this.reports.sendDailySummary();
  }
}
```

With several replicas, each one runs the cron. Use a queue's repeatable jobs or a DB advisory lock (`select pg_try_advisory_lock(…)`) so only one instance does the work.

## Sending email

1. Port in `shared/notifications/mailer.port.ts`: `abstract send(msg: { to; subject; html; text }): Promise<void>`.
2. Adapters: `SmtpMailer` (nodemailer), `SesMailer`, `ResendMailer`, and a `ConsoleMailer` for dev and tests.
3. Pick the adapter in the module factory based on config.
4. Send from **event listeners or queue jobs**, not inline in the request path. Replace the log line in `UserRegisteredListener` with a mailer call.

## Transactional outbox

In-process events fire before commit and are lost if the process crashes. When a side effect **must** happen exactly when data commits (emails, webhooks, messages to other services):

1. Migration: `outbox(id uuid pk, type text, payload jsonb, created_at, processed_at null)`.
2. In the same `@Transactional()` method that changes data, insert an outbox row through an `OutboxRepository`. It commits atomically with your data.
3. A worker (cron or queue) polls `where processed_at is null order by created_at limit 100 for update skip locked`, publishes, then sets `processed_at`.
4. Consumers must be idempotent (at-least-once delivery).

## Soft delete

1. Migration: `deleted_at timestamptz null` plus a partial index, for example `create unique index … on users(email) where deleted_at is null`.
2. Domain: a `delete()` method on the entity sets `deletedAt`.
3. Repository: every read adds `.where('deletedAt', 'is', null)`. Put it in one private `base()` query builder so it can't be forgotten.
4. Hard-delete or anonymise after the retention period (GDPR).

## Cursor pagination

For large tables or infinite scroll, use keyset pagination, which avoids `OFFSET`:

```ts
// query: ?limit=20&cursor=<base64 of {createdAt,id}>
let q = this.db.tx.selectFrom('orders').selectAll();
if (cursor) {
  q = q.where((eb) =>
    eb.or([
      eb('createdAt', '<', cursor.createdAt),
      eb.and([eb('createdAt', '=', cursor.createdAt), eb('id', '<', cursor.id)]),
    ]),
  );
}
const rows = await q
  .orderBy('createdAt', 'desc')
  .orderBy('id', 'desc')
  .limit(limit + 1)
  .execute();
const hasMore = rows.length > limit;
// return { items: rows.slice(0, limit), nextCursor: hasMore ? encode(last) : null }
```

Index: `(created_at desc, id desc)`.

## Optimistic locking

1. Migration: `version integer not null default 0`.
2. Entity carries `version`. Update with `where id = ? and version = ?` and `set version = version + 1`.
3. If `numUpdatedRows === 0n`, throw `ConflictError('Resource was modified', 'STALE_VERSION')`.
4. Expose `version` (or an `ETag`) to clients and require it on updates.

## File uploads

- Prefer **direct-to-storage uploads**: the API issues a pre-signed S3, GCS or Azure URL (a `StoragePort` with `createUploadUrl`), the client uploads directly, and the API stores only the key. This keeps large bodies off your Node process.
- If files must pass through the API: `FileInterceptor` from `@nestjs/platform-express`, with strict `limits.fileSize` and MIME/magic-byte checks. Stream to storage; don't buffer.

## Refresh token in an HttpOnly cookie

For browser SPAs, keep the refresh token out of JavaScript:

```ts
// login / refresh handler
res.cookie('refresh_token', tokens.refreshToken, {
  httpOnly: true,
  secure: true,
  sameSite: 'strict',
  path: '/api/v1/auth',
  maxAge: ttlMs,
});
// return only the access token in the body
```

The refresh endpoint reads `req.cookies.refresh_token` (add `cookie-parser`). Set `CORS_ORIGINS` explicitly (credentials need it) and consider CSRF protection on that route.

## Calling external HTTP APIs

- Put each external system behind a port in the feature that needs it (`PaymentGateway`, `GeoCoder`).
- In the adapter: use `fetch` with `AbortSignal.timeout(ms)`, retry idempotent calls with backoff, forward `x-request-id`, and translate errors to `ServiceUnavailableError` or feature errors.
- Test services with a fake adapter. Test the adapter itself against a mock server (`msw`) if it's complex.

## Multi-tenancy

- **Row-level (shared schema):** add `tenant_id` to tenant-owned tables. Resolve the tenant in a guard or middleware, store it in CLS (`cls.set('tenantId', …)`), and have repositories add `.where('tenantId', '=', this.cls.get('tenantId'))`. PostgreSQL Row-Level Security (RLS) policies add defence in depth.
- **Schema or database per tenant:** keep a `Map<tenantId, Kysely>` in a tenant-aware database provider, chosen per request from CLS.
