# 15 · Security

What the starter protects against out of the box, where each protection lives, what it deliberately leaves to you, and the checklist to run before going live.

To report a vulnerability, see [SECURITY.md](../SECURITY.md).

## At a glance

| Threat                                 | Protection                                                                                      | Where                                                                |
| -------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Forgotten auth on a new endpoint       | Every route needs a token unless marked `@Public()`                                             | `modules/auth/presentation/auth.guard.ts`                            |
| Privilege escalation                   | `@Roles()` on the route, ownership checks in services                                           | `core/security`, your services                                       |
| Stolen refresh token                   | Single-use rotation, reuse detection revokes every session, only a SHA-256 hash is stored       | `modules/auth/application/auth.service.ts`                           |
| Compromised password                   | Changing the password revokes every session of the user                                         | `modules/auth/application/session-revocation.listener.ts`            |
| Token confusion and forgery            | Pinned HS256, separate access/refresh secrets, `typ` claim, issuer and audience checked         | `modules/auth/application/token.service.ts`                          |
| Password database leak                 | Argon2id (OWASP parameters)                                                                     | `infrastructure/security/argon2-password-hasher.ts`                  |
| Brute force and credential stuffing    | Global rate limit, 10 requests/minute on register, login and refresh                            | `core/core.module.ts`, `auth.controller.ts`                          |
| User enumeration through login         | Identical response and equalised timing for unknown emails                                      | `modules/users/application/users.service.ts`                         |
| SQL injection                          | Kysely parameterises every value; `escapeLike()` for `LIKE` patterns                            | `modules/*/infrastructure`                                           |
| Mass assignment, malformed input       | Zod schema on every `@Body`/`@Query`/`@Param`; unknown keys are dropped                         | `modules/*/presentation/*.schemas.ts`                                |
| Leaking internal fields                | Presenters pick response fields explicitly                                                      | `modules/*/presentation/*.presenter.ts`                              |
| Leaking internals through errors       | 5xx bodies are generic; the stack goes to the log only                                          | `core/http/all-exceptions.filter.ts`                                 |
| Cross-site request abuse               | CORS allow-list; a wildcard never gets credentials and is rejected in production                | `app.setup.ts`, `config/env.schema.ts`                               |
| Clickjacking, MIME sniffing, downgrade | helmet: HSTS, `nosniff`, frame denial, and a `default-src 'none'` CSP on every API response     | `app.setup.ts`                                                       |
| Cached tokens or personal data         | `Cache-Control: no-store` on every response                                                     | `app.setup.ts`                                                       |
| Oversized or slow requests             | Body limit (`BODY_LIMIT`), request timeout, DB statement and idle-in-transaction timeouts       | `app.setup.ts`, `core/http/timeout.interceptor.ts`, `kysely.factory` |
| Spoofed client IP (rate-limit bypass)  | `X-Forwarded-For` is trusted only for the configured number of proxy hops                       | `app.setup.ts` (`TRUST_PROXY`)                                       |
| Secrets in logs                        | pino redacts auth headers, cookies, passwords and tokens                                        | `infrastructure/logger/logger.module.ts`                             |
| Weak or default configuration          | The app refuses to boot on invalid env, placeholder secrets or wildcard CORS in production      | `config/env.schema.ts`                                               |
| Vulnerable dependencies                | `pnpm audit` in CI, weekly Dependabot PRs, install scripts allow-listed in `package.json`       | `.github/`                                                           |
| Container breakout surface             | Non-root user, no build tools in the image; read-only filesystem and dropped capabilities shown | `Dockerfile`, `docker-compose.yml`                                   |

## HTTP hardening

`configureApp()` in `src/app.setup.ts` builds the pipeline that both production and the e2e tests use.

### Headers

Every API response carries:

```http
Content-Security-Policy: default-src 'none';base-uri 'none';form-action 'none';frame-ancestors 'none'
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
X-Frame-Options: SAMEORIGIN
Referrer-Policy: no-referrer
Cache-Control: no-store
```

The API returns JSON, so the CSP forbids everything: if a response is ever rendered as a document, it can load nothing and cannot be framed. The docs page is the one exception and sets its own policy (see below).

`Cache-Control: no-store` is the default because responses can hold personal data and tokens. For an endpoint that serves public, cacheable data, override it on the handler:

```ts
@Get('countries')
@Public()
@Header('Cache-Control', 'public, max-age=3600')
countries() {}
```

### CORS

`CORS_ORIGINS` is an allow-list of browser origins.

- A listed origin gets `Access-Control-Allow-Credentials: true`.
- `*` allows any origin **without** credentials. Reflecting every origin together with credentials would let any website call the API as the logged-in user.
- In production `*` is rejected at boot.

CORS only restricts browsers. Server-to-server clients are not affected, and it is not an authentication mechanism.

### The docs page

`/docs` serves the Scalar API reference with a policy of its own:

- Scripts run only with a **per-request nonce**: no `unsafe-inline`, no `unsafe-eval`.
- `connect-src 'self'`: the built-in request client can call this API and nothing else.
- The Scalar bundle is loaded from jsDelivr **pinned to an exact version** (`SCALAR_BUNDLE_URL` in `core/openapi/openapi.ts`), so an upstream release cannot change what runs on the page.
- Telemetry, the hosted AI assistant and the cloud toolbar are switched off. Tokens typed into the page are not persisted.

The page and the OpenAPI JSON are public when enabled, and they describe your whole API. They are off in production unless you set `API_DOCS_ENABLED=true`. If you want them in production, put them behind your VPN or an authenticating proxy.

### Rate limiting

- Default: `THROTTLE_LIMIT` requests per `THROTTLE_TTL_MS` per client IP (100 per minute).
- `register`, `login` and `refresh`: 10 per minute.
- Responses carry `X-RateLimit-*` headers; a `429` carries `Retry-After`.

Two things to get right in production:

1. **`TRUST_PROXY`.** Behind a load balancer every request appears to come from the balancer's IP. Set `TRUST_PROXY` to the number of proxies in front of the app (`true` = 1). Setting it higher than the real number lets clients spoof their IP through `X-Forwarded-For`.
2. **Shared storage.** Counters live in memory per instance. With several replicas, use the Redis storage from [Recipes](14-recipes.md#redis-backed-rate-limiting).

## Authentication and sessions

The model is described in [09 – Authentication & authorization](09-authentication-and-authorization.md). The security-relevant properties:

- **Access tokens are stateless** and live 15 minutes (`JWT_ACCESS_TTL`). Revoking a session (logout, password change, reuse detection) stops refreshes immediately, but an access token already issued stays valid until it expires. Shorten the TTL, or check `sid` against the database or a cache in `AuthGuard`, if you need instant revocation.
- **A role change** reaches the client at its next refresh, for the same reason.
- **Registration reveals whether an email is taken** (`409 USER_EMAIL_TAKEN`). That is the usual trade-off for a sign-up form. If it matters for your product, always answer `202` and send an email instead.
- **Rotating a JWT secret** invalidates every token signed with it. All users log in again.

## Data and database

- All SQL is in `modules/*/infrastructure/kysely-*.repository.ts` and goes through Kysely, which sends values as bind parameters. Never build SQL by concatenating strings. If you need raw SQL, use the `sql` template tag, which also parameterises.
- User input inside `LIKE`/`ILIKE` goes through `escapeLike()`.
- `DB_SSL=true` verifies the server certificate (`rejectUnauthorized: true`).
- The pool fails fast (`DB_CONNECTION_TIMEOUT_MS`), queries are bounded (`DB_STATEMENT_TIMEOUT_MS`), and a stuck transaction cannot hold locks forever (`DB_IDLE_IN_TX_TIMEOUT_MS`).
- Give the application's database user only what it needs (no `SUPERUSER`, no `CREATEDB`). Run migrations with a separate, more privileged user if you can.

## Secrets and configuration

- Secrets come from environment variables, validated at boot. `.env` is git-ignored and excluded from the Docker image.
- Production refuses to start with the `change-me…` placeholder secrets, identical access and refresh secrets, secrets shorter than 32 characters, or a wildcard CORS origin.
- Generate secrets with `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`.
- Never log configuration objects or request bodies. The logger redacts known secret fields, but redaction is a safety net, not a licence.

## Supply chain

- `pnpm audit --prod --audit-level high` runs in CI (`pnpm audit` locally).
- Dependabot opens weekly PRs for npm packages, GitHub Actions and the Docker base image.
- `pnpm-lock.yaml` is committed and CI installs with `--frozen-lockfile`.
- Only packages listed under `pnpm.onlyBuiltDependencies` may run install scripts.
- CI jobs run with a read-only `GITHUB_TOKEN`.

## What is not included

Decide on these before launch. None is hard to add on top of what is here.

| Not included                           | Why it matters                                     | Starting point                                                          |
| -------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------- |
| Email verification, password reset     | Proves address ownership, account recovery         | A token table plus [Recipes § email](14-recipes.md#sending-email)       |
| Multi-factor authentication            | Protects against stolen passwords                  | TOTP (`otplib`) or passkeys; open the session through `startSession()`  |
| Per-account lockout                    | Rate limits are per IP; a botnet spreads its tries | Count failed logins per account in Redis, add delay or lockout          |
| Breached-password check                | Stops known-leaked passwords                       | k-anonymity lookup against Have I Been Pwned in `UsersService.register` |
| Audit log                              | Who did what, for incident response and compliance | Subscribe to domain events, write to an append-only table               |
| Instant access-token revocation        | See "Authentication and sessions" above            | Session check in `AuthGuard`                                            |
| WAF, DDoS protection, TLS termination  | Belongs at the edge, not in the app                | Your cloud provider's load balancer and WAF                             |
| Field-level encryption, data retention | Regulatory requirements (GDPR, HIPAA, …)           | Depends on your data                                                    |

## Pre-launch checklist

- [ ] `NODE_ENV=production`; the app boots, so the built-in configuration checks passed
- [ ] JWT secrets are random, at least 32 bytes each, different, and stored in a secret manager
- [ ] `CORS_ORIGINS` lists exactly the front-end origins
- [ ] `TRUST_PROXY` equals the number of proxies in front of the app
- [ ] TLS terminates at the load balancer; plain HTTP redirects to HTTPS
- [ ] `/docs` is disabled, or reachable only from your network
- [ ] `DB_SSL=true`; the database is not reachable from the internet; the app uses a least-privilege DB user
- [ ] Rate limiting uses shared storage if you run more than one replica
- [ ] The seed admin password was changed, or the seed was never run with a default
- [ ] The container runs read-only, as non-root, with capabilities dropped (see `docker-compose.yml`)
- [ ] `pnpm audit` is clean and the image is scanned (Trivy, Grype or your registry)
- [ ] Logs are shipped, and alerts exist for 5xx rate and "Refresh token reuse detected"
- [ ] Backups are enabled and a restore has been tested
- [ ] Everything under "What is not included" has an explicit decision
