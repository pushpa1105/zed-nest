# 13 · Conventions

## Code style

- **Formatting:** Prettier (`pnpm format`): single quotes, trailing commas, 100 columns. Don't argue about it; let the tool decide.
- **Linting:** oxlint, type-aware (`pnpm lint`). Floating promises are errors. Architecture boundaries are errors.
- **TypeScript:** `strict` is on. Avoid `any` (it's a lint warning) and prefer `unknown` plus narrowing.
- **ESM:** relative imports end in `.js`.
- Prefer `type` imports for types only: `import type { X } from …`. DI tokens (abstract classes) must be value imports.

## Naming

| Thing               | Convention                         | Example                                               |
| ------------------- | ---------------------------------- | ----------------------------------------------------- |
| Files               | kebab-case + role suffix           | `kysely-user.repository.ts`                           |
| Classes             | PascalCase + role                  | `UsersService`, `UserRepository`, `UserNotFoundError` |
| Feature folder      | plural kebab                       | `modules/order-items`                                 |
| Entity              | singular                           | `OrderItem`                                           |
| DB tables / columns | plural snake_case / snake_case     | `order_items.unit_price_cents`                        |
| TS table keys       | camelCase (CamelCasePlugin)        | `orderItems.unitPriceCents`                           |
| Error codes         | `FEATURE_REASON`                   | `ORDER_ALREADY_PAID`                                  |
| Events              | `<feature>.<past-tense>`           | `orders.paid`                                         |
| Routes              | plural kebab nouns, versioned      | `/api/v1/order-items/:id`                             |
| Env vars            | SCREAMING_SNAKE, grouped by prefix | `DB_POOL_MAX`, `JWT_ACCESS_TTL`                       |

## Design rules

1. **One feature, one folder.** If you can't decide where code goes, it probably belongs to a feature, not `shared/`.
2. **`shared/` is for truly generic code** with no business meaning and no framework. Keep it small.
3. **Controllers are thin:** validate, call one service method, present.
4. **Services own use cases.** They don't know about HTTP or SQL.
5. **Repositories own SQL.** They don't make business decisions.
6. **Entities own invariants.** State changes go through methods, not public setters.
7. **Expose a feature through its `index.ts`.** Treat everything else as private.
8. **Money** is an integer in minor units (`priceCents`) or `numeric` in the DB. Never use floats.
9. **Time:** store `timestamptz`, compute in UTC, and inject `now` into entities for testability.
10. **IDs:** UUIDv7 generated in the app (`generateId()`).

## Git workflow

- Branch from `main`: `feat/orders-refunds`, `fix/login-timing`, `chore/deps`.
- **Conventional Commits** are enforced by commitlint:
  ```
  feat(orders): allow partial refunds
  fix(auth): reject refresh tokens with wrong typ
  chore(deps): bump kysely to 0.30
  docs(database): explain expand/contract migrations
  ```
- The pre-commit hook runs lint-staged (oxlint + Prettier on changed files).
- Run `pnpm validate` before pushing. PRs need a green CI.
- Keep PRs focused: one feature or fix, with migration and tests in the same PR.

## Documenting decisions

For significant technical choices (a new library, a pattern change, a trade-off), add an ADR in `docs/adr/` using `0000-template.md`. Future maintainers will want to know _why_ as well as _what_.

## Dependencies

- Add with `pnpm add <pkg>` (or `-D` for tooling). Commit `pnpm-lock.yaml`.
- Before adding a dependency, check its maintenance, its size and whether the platform already covers it (Node has `fetch`, `crypto.randomUUID`, `loadEnvFile`, a test runner, …).
- Wrap third-party SDKs (payments, email, storage) behind a **port** in the owning feature, as `PasswordHasher` does, so they stay swappable and testable.
