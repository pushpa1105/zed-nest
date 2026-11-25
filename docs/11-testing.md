# 11 · Testing

**Runner:** [Vitest](https://vitest.dev), the NestJS 12 default. It is Jest-compatible: `describe`, `it`, `expect`, and `vi` instead of `jest`.

| Level | Location                             | Runs against                                | Command         | Speed   |
| ----- | ------------------------------------ | ------------------------------------------- | --------------- | ------- |
| Unit  | `src/**/*.spec.ts`, next to the code | In-memory fakes                             | `pnpm test`     | ms      |
| E2E   | `test/**/*.e2e-spec.ts`              | Real app + real PostgreSQL (Testcontainers) | `pnpm test:e2e` | seconds |

```bash
pnpm test               # unit, once
pnpm test:watch         # unit, watch mode
pnpm test:cov           # coverage report → coverage/
pnpm test:e2e           # needs Docker, or TEST_DATABASE_URL=postgres://… (an empty DB)
```

## What to test where

| Test this…                                                    | …with                                                                           |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Entity invariants and behaviour                               | Unit tests on the entity (`user.spec.ts`)                                       |
| Use cases, business rules, error paths                        | Unit tests on the service with in-memory repositories (`users.service.spec.ts`) |
| SQL correctness, constraints, transactions                    | E2E (or repository integration tests against the container)                     |
| HTTP contract: status codes, validation, auth, response shape | E2E (`test/users.e2e-spec.ts`)                                                  |

## Unit tests: use the ports

Because services depend on abstract repositories, you swap in a fake. You don't need mocking libraries or a database:

```ts
const repo = new InMemoryUserRepository();
const moduleRef = await Test.createTestingModule({
  providers: [
    UsersService,
    { provide: UserRepository, useValue: repo },
    { provide: PasswordHasher, useClass: FakePasswordHasher }, // argon2 is slow by design
    { provide: EventEmitter2, useValue: { emit: vi.fn() } },
  ],
}).compile();
```

Or construct the service directly: `new UsersService(repo, new FakePasswordHasher(), events)`.

Test doubles live in each feature's `testing/` folder, so other features' tests can reuse them (as `auth.service.spec.ts` does).

### `@Transactional()` in unit tests

The decorator needs the CLS context. In pure unit tests, make it a no-op:

```ts
vi.mock(import('@nestjs-cls/transactional'), async (importOriginal) => ({
  ...(await importOriginal()),
  Transactional: (() => (_t: unknown, _k: string, d: PropertyDescriptor) => d) as never,
}));
```

## E2E tests

`test/setup/global-setup.ts` starts one PostgreSQL container for the whole run and applies migrations. Each suite then:

```ts
let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
}); // real AppModule + configureApp()
beforeEach(() => t.reset()); // truncate tables → isolation
afterAll(() => t.close());

it('…', async () => {
  const user = await registerUser(t); // helper: register via the API
  await t
    .http()
    .get('/api/v1/users/me')
    .auth(user.tokens.accessToken, { type: 'bearer' })
    .expect(200);
});
```

- E2E tests run **serially** (`fileParallelism: false`) because they share one database.
- When you add a table, add it to `reset()` in `test/helpers/test-app.ts`.
- Use the `createAdmin(t)` helper for admin-only routes.
- Set rate limits aside: throttling is disabled when `NODE_ENV=test`.

### Testing a specific configuration

`createTestApp()` takes env overrides, validated like real configuration:

```ts
t = await createTestApp({ API_DOCS_ENABLED: 'true' });
t = await createTestApp({ CORS_ORIGINS: 'https://app.example.com' });
```

Keep **one app alive at a time**. `nestjs-cls` holds process-wide state, so closing a second instance breaks the first. Use a separate `describe` block (or file) per configuration, each with its own `beforeAll`/`afterAll`.

### What the cross-cutting suites cover

| File                             | Covers                                                                           |
| -------------------------------- | -------------------------------------------------------------------------------- |
| `test/http-pipeline.e2e-spec.ts` | Security headers, `no-store`, CORS rules, malformed JSON, body limit, bad tokens |
| `test/api-docs.e2e-spec.ts`      | Scalar page and its CSP, OpenAPI completeness, public routes, documented errors  |
| `test/auth.e2e-spec.ts`          | Token rotation and reuse, logout, password change revocation, session cleanup    |

## Conventions

- Name tests by behaviour: `it('rejects duplicate emails case-insensitively')`.
- Arrange → act → assert, one behaviour per test.
- Don't assert on log output or private methods.
- Assert on error **classes** (`rejects.toBeInstanceOf(UserNotFoundError)`) or on `code`s, not on messages.
- Coverage is a signal, not a target. Business rules and error paths matter most.

## CI

`.github/workflows/ci.yml` runs format check → lint → typecheck → unit + coverage → build, then e2e (Testcontainers works on GitHub-hosted Ubuntu runners) and a Docker build.
