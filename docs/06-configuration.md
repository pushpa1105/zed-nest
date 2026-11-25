# 06 · Configuration

All configuration comes from environment variables. They are **validated once at boot** and exposed as a typed, frozen `AppConfig` object.

```
.env / real env ─▶ env.schema.ts (Zod: coerce, default, validate) ─▶ AppConfig (grouped, typed, frozen)
                                                                        │
                                       constructor(private readonly config: AppConfig) {}
```

- If any variable is invalid, the app **refuses to start** and prints every problem at once.
- **Never read `process.env` elsewhere.** Inject `AppConfig`, or call `loadConfig()` in standalone scripts.
- Real environment variables always win over `.env` (the file is loaded with `process.loadEnvFile`, which never overrides).

## Variables

| Variable                                   | Default                           | Description                                                                           |
| ------------------------------------------ | --------------------------------- | ------------------------------------------------------------------------------------- |
| `NODE_ENV`                                 | `development`                     | `development` \| `test` \| `production`                                               |
| `PORT`                                     | `3000`                            | HTTP port                                                                             |
| `API_PREFIX`                               | `api`                             | Global route prefix → `/api/v1/...`                                                   |
| `CORS_ORIGINS`                             | `*`                               | Comma-separated allow-list of browser origins. `*` is rejected in production          |
| `API_DOCS_ENABLED`                         | `true` (non-prod), `false` (prod) | Serve the Scalar API reference and OpenAPI JSON under `/docs`                         |
| `REQUEST_TIMEOUT_MS`                       | `15000`                           | Global per-request timeout (→ 408)                                                    |
| `BODY_LIMIT`                               | `1mb`                             | Max JSON/urlencoded body size                                                         |
| `TRUST_PROXY`                              | `false`                           | Proxy hops to trust: `false`, `true` (= 1) or a number. Needed for the real client IP |
| `HTTP_KEEP_ALIVE_TIMEOUT_MS`               | `65000`                           | Idle keep-alive timeout. Keep it above the load balancer's (usually 60 s)             |
| `LOG_LEVEL`                                | `info`                            | `fatal`…`trace`, `silent`                                                             |
| `LOG_PRETTY`                               | `false`                           | Human-readable logs (dev only)                                                        |
| `DB_CLIENT`                                | `postgres`                        | Dialect selector, see [05](05-database.md#switching-the-database-engine)              |
| `DATABASE_URL`                             | – (required)                      | Connection string                                                                     |
| `DB_POOL_MAX`                              | `10`                              | Pool size per instance                                                                |
| `DB_SSL`                                   | `false`                           | TLS to the DB                                                                         |
| `DB_STATEMENT_TIMEOUT_MS`                  | `10000`                           | Server-side query timeout (`0` = none)                                                |
| `DB_CONNECTION_TIMEOUT_MS`                 | `5000`                            | Max wait for a free pooled connection before the query fails (`0` = forever)          |
| `DB_IDLE_TIMEOUT_MS`                       | `30000`                           | Close pooled connections idle this long (`0` = never)                                 |
| `DB_IDLE_IN_TX_TIMEOUT_MS`                 | `30000`                           | Server ends sessions idle inside a transaction this long (`0` = never)                |
| `DB_LOG_QUERIES`                           | `false`                           | Log SQL at debug level                                                                |
| `JWT_ACCESS_SECRET`                        | – (required, ≥32 chars)           | Access-token signing secret                                                           |
| `JWT_ACCESS_TTL`                           | `900`                             | Seconds                                                                               |
| `JWT_REFRESH_SECRET`                       | – (required, ≥32 chars, ≠ access) | Refresh-token signing secret                                                          |
| `JWT_REFRESH_TTL`                          | `1209600`                         | Seconds (14 days)                                                                     |
| `JWT_ISSUER` / `JWT_AUDIENCE`              | `zed-nest` / `zed-nest-clients`   | Checked on verification                                                               |
| `THROTTLE_TTL_MS` / `THROTTLE_LIMIT`       | `60000` / `100`                   | Default rate limit window/requests per IP                                             |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | –                                 | Used by `pnpm db:seed`                                                                |

Built-in safety rules (see `superRefine` in `env.schema.ts`):

- Access and refresh secrets must be different.
- In production, the `change-me…` placeholder secrets are rejected.
- In production, a wildcard (`*`) in `CORS_ORIGINS` is rejected. Outside production it is allowed, but never combined with credentials.

`TRUST_PROXY` must match the real number of proxies in front of the app. Too low and every client shares the proxy's IP (one rate-limit bucket for everyone). Too high and clients can spoof their IP with `X-Forwarded-For`.

Generate a secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

## Adding a variable

1. **Schema:** add it to `src/config/env.schema.ts`.
   ```ts
   STRIPE_API_KEY: z.string().startsWith('sk_'),
   STRIPE_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
   ```
2. **Typed section:** add it to `AppConfig` in `src/config/app-config.ts`.
   ```ts
   export interface PaymentsConfig { readonly stripeApiKey: string; readonly timeoutMs: number }
   readonly payments: PaymentsConfig;
   // in the constructor:
   this.payments = Object.freeze({ stripeApiKey: env.STRIPE_API_KEY, timeoutMs: env.STRIPE_TIMEOUT_MS });
   ```
3. **Document it** in `.env.example` and in the table above.
4. **Use it:** `constructor(private readonly config: AppConfig) {}` → `this.config.payments.stripeApiKey`.

Booleans: use the `bool` helper (`'true'|'false'|'1'|'0'|'yes'|'no'`). Don't use `z.coerce.boolean()`, because it turns the string `'false'` into `true`.

## Overriding config in tests

```ts
const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
  .overrideProvider(AppConfig)
  .useValue(new AppConfig(parseEnv({ ...process.env, REQUEST_TIMEOUT_MS: '50' })))
  .compile();
```

## Secrets in production

Don't bake `.env` files into images (`.dockerignore` excludes them). Inject secrets as environment variables from your platform's secret store, such as Kubernetes Secrets, AWS Secrets Manager / SSM, GCP Secret Manager or Vault. Rotate the JWT secrets by deploying new values. Existing tokens then become invalid, so users have to log in again.
