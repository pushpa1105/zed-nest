# ADR 0006: Scalar for the API reference

- **Status:** accepted
- **Date:** 2026-11-25

## Context

The API reference was served by Swagger UI through `SwaggerModule.setup()`. Swagger UI needs inline scripts, so the whole application ran **without a Content-Security-Policy** whenever docs were enabled. It also shows its age: no code samples per language, weak search, and a dated request client.

Two separate things hide behind the word "Swagger":

1. **Generating the OpenAPI document** from controllers and Zod schemas. `@nestjs/swagger` does this, and it is the only generator that understands Nest's native Standard Schema support (`@Body({ schema })`, `standardSchema` on response decorators).
2. **Rendering the document** as a web page (Swagger UI).

## Decision

- Keep `@nestjs/swagger` as the **document generator only**. Controllers keep using its decorators (`@ApiOperation`, `@ApiOkResponse({ standardSchema })`, …).
- Render the document with **[Scalar](https://scalar.com)** (`@scalar/nestjs-api-reference`) at `/docs`. Swagger UI is no longer mounted.
- Serve the docs page under its own **nonce-based CSP**, and give every other response a `default-src 'none'` policy. Enabling docs no longer weakens the API.
- Load the Scalar browser bundle from jsDelivr **pinned to an exact version**, with telemetry, the hosted AI assistant and the cloud toolbar disabled.
- Rename the switch to `API_DOCS_ENABLED` (it no longer has anything to do with Swagger UI).
- `pnpm openapi:export` writes the document to disk for client generation and contract diffs.

## Consequences

- The docs page gets request samples in many languages, full-text search, a better request client and dark mode.
- `@nestjs/swagger` stays a dependency. Its name is misleading, but replacing the generator would mean giving up Zod-driven documentation.
- The docs page needs network access to jsDelivr. For air-gapped environments, serve the bundle yourself (see [07 – Validation & API contracts](../07-validation-and-api.md#serving-the-scalar-bundle-yourself)).
- Bumping the pinned Scalar version is a deliberate, reviewed change (`SCALAR_BUNDLE_URL` in `src/core/openapi/openapi.ts`).
- Any OpenAPI renderer can replace Scalar by changing one function (`setupApiDocs`), since the document is plain OpenAPI 3.
