# 12 · Deployment

## Build artefact

A multi-stage `Dockerfile`:

- `deps` → `build` (compiles TypeScript, prunes dev dependencies) → `runtime`
- The runtime image contains only `dist/` and production `node_modules`, runs as the non-root `node` user, and uses **tini** as PID 1 so `SIGTERM` reaches Node and graceful shutdown works.
- `HEALTHCHECK` calls `/api/health/live`.

```bash
docker build -t zed-nest:$(git rev-parse --short HEAD) .
```

## Release sequence

```
1. build image (CI)
2. run migrations   → node dist/infrastructure/database/cli/migrate.js latest   (one-off job, same image)
3. roll out the app → new pods start, pass readiness, old pods drain
```

- Run migrations **once per release, before** the new version receives traffic. Use a Kubernetes `Job` or Helm pre-upgrade hook, an ECS one-off task, or a CI step. Don't run them in `main.ts`: with many replicas they would race (Kysely takes a lock, but startup gets slower and coupled).
- Migrations must stay **compatible with the previous app version**, because old and new pods coexist during a rollout. See the expand/contract rules in [05](05-database.md#migrations).

`docker-compose.yml`'s `full` profile reproduces this sequence locally (`migrate` → `api`).

## Runtime configuration

| Setting        | Production value                                                     |
| -------------- | -------------------------------------------------------------------- |
| `NODE_ENV`     | `production` (API docs off by default, placeholder secrets rejected) |
| `LOG_PRETTY`   | `false` (JSON for your log pipeline)                                 |
| `LOG_LEVEL`    | `info`                                                               |
| `TRUST_PROXY`  | The number of proxies in front of the app (`true` = 1)               |
| `DB_SSL`       | `true` on managed databases                                          |
| `CORS_ORIGINS` | Explicit list. `*` is rejected at boot in production                 |
| `JWT_*_SECRET` | From a secret manager, ≥ 32 random bytes, different from each other  |

## Kubernetes example

```yaml
containers:
  - name: api
    image: registry/zed-nest:1.4.0
    ports: [{ containerPort: 3000 }]
    envFrom: [{ secretRef: { name: zed-nest-env } }]
    readinessProbe: { httpGet: { path: /api/health/ready, port: 3000 }, periodSeconds: 10 }
    livenessProbe:
      { httpGet: { path: /api/health/live, port: 3000 }, periodSeconds: 15, failureThreshold: 3 }
    resources:
      requests: { cpu: 250m, memory: 256Mi }
      limits: { memory: 512Mi }
terminationGracePeriodSeconds: 30
```

## Graceful shutdown

On `SIGTERM`:

1. The server stops accepting connections.
2. In-flight requests finish.
3. Shutdown hooks run, and `DatabaseModule` closes the pool.

This is enabled by `app.enableShutdownHooks()` in `main.ts`. Keep `terminationGracePeriodSeconds` above `REQUEST_TIMEOUT_MS`.

An uncaught exception is logged at `fatal` and the process exits with code 1, so the orchestrator replaces the instance instead of leaving one in an unknown state.

## Behind a load balancer

- **Keep-alive.** The app keeps idle connections for `HTTP_KEEP_ALIVE_TIMEOUT_MS` (65 s). This must be longer than the balancer's idle timeout (AWS ALB and nginx default to 60 s). Otherwise the app closes a connection the balancer is about to reuse, and clients see sporadic 502s.
- **Client IP.** Set `TRUST_PROXY` to the number of proxies. Rate limiting and the session IP depend on it.
- **TLS** terminates at the balancer. The app sends HSTS, so serve everything over HTTPS.

## Container hardening

The image runs as the non-root `node` user and writes nothing to disk, so it works with a read-only root filesystem and no Linux capabilities. `docker-compose.yml` shows the flags:

```yaml
read_only: true
tmpfs: ['/tmp']
cap_drop: ['ALL']
security_opt: ['no-new-privileges:true']
```

The Kubernetes equivalent:

```yaml
securityContext:
  runAsNonRoot: true
  readOnlyRootFilesystem: true
  allowPrivilegeEscalation: false
  capabilities: { drop: ['ALL'] }
```

## Scaling notes

- The app is **stateless**, so scale horizontally.
- **Connection budget:** replicas × `DB_POOL_MAX` must stay under Postgres `max_connections` (leave headroom). Use PgBouncer (transaction mode) at scale.
- **Rate limiting** storage is in memory per instance. With N replicas, the effective limit is N × the configured limit. Use Redis storage ([Recipes](14-recipes.md#redis-backed-rate-limiting)).
- In-process **events** don't cross instances. Use a queue or outbox for cross-instance work.

## Production checklist

- [ ] Secrets come from a secret manager, not baked into the image
- [ ] `NODE_ENV=production`, JSON logs shipped to your log platform
- [ ] Migrations run as a separate release step
- [ ] Readiness and liveness probes configured
- [ ] TLS terminated at the load balancer, `TRUST_PROXY=true`
- [ ] CORS restricted to known origins
- [ ] The [security checklist](15-security.md#pre-launch-checklist) is done
- [ ] DB backups and point-in-time recovery enabled, and restore tested
- [ ] Alerts on 5xx rate, latency and readiness
- [ ] Dependabot PRs are reviewed and merged; the `audit` CI job is green
- [ ] Image scanned (Trivy, Grype or registry scanning)
