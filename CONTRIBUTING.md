# Contributing

1. Read [docs/02-architecture.md](docs/02-architecture.md) and [docs/13-conventions.md](docs/13-conventions.md).
2. Branch from `main` (`feat/…`, `fix/…`, `chore/…`).
3. Make your change with tests. For a new feature, start with `pnpm gen:feature <name>`.
4. Run `pnpm validate` (and `pnpm test:e2e` if you touched the DB or HTTP layer).
5. Commit with [Conventional Commits](https://www.conventionalcommits.org). The hooks check formatting, lint and the message.
6. Open a PR describing **what** changed and **why**. Link any ADR you added.

## PR checklist

- [ ] Follows the layer rules (lint passes)
- [ ] Inputs validated with Zod; responses and errors documented (`@ApiProblem`), and the endpoint reads well at `/docs`
- [ ] Errors use `AppError` subclasses with stable codes
- [ ] Migrations are backwards-compatible and have `down()`
- [ ] Tests added or updated, CI green
- [ ] Docs updated if behaviour, config or conventions changed
- [ ] No security default weakened (see [docs/15-security.md](docs/15-security.md)). Vulnerabilities go through [SECURITY.md](SECURITY.md), not public issues
