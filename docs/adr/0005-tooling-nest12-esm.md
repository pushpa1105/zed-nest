# ADR 0005: NestJS 12 native ESM toolchain (TypeScript 6, Vitest, oxlint)

- **Status:** accepted
- **Date:** 2026-11-25

## Context

NestJS 12 ships ESM-only packages, and new projects default to Vitest and oxlint. TypeScript 7 (the native Go compiler) is out, but the Nest CLI pins TypeScript `~6.0` for `nest build`.

## Decision

- `"type": "module"`, `module`/`moduleResolution: nodenext`, `.js` suffixes in relative imports.
- **TypeScript 6** (pinned `~6.0`), matching the Nest CLI. Revisit when the CLI supports TS 7.
- **Vitest** for unit and e2e tests (decorator metadata works through Vite 8 with no extra plugin).
- **oxlint** (type-aware) for linting, including architecture boundary rules.
- **tsx** to run TypeScript CLIs (migrations, seeds, generator) in development. The same CLIs are compiled to `dist/` for production.

## Consequences

- Contributors must use `.js` import suffixes. The editor is configured to add them.
- Fast lint and test feedback (oxlint and Vitest are much faster than ESLint and Jest).
- Upgrading to TS 7 later is a version bump plus a CLI check.
