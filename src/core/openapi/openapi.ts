import { randomBytes } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import { apiReference } from '@scalar/nestjs-api-reference';
import type { Express, Request, Response } from 'express';
import { PROBLEM_CONTENT_TYPE } from '../http/problem-details.js';
import { PUBLIC_ROUTE_EXTENSION } from '../security/public.decorator.js';

export const DOCS_PATH = 'docs';
export const OPENAPI_JSON_PATH = `${DOCS_PATH}/openapi.json`;
export const BEARER_AUTH = 'access-token';
export const API_VERSION = '1.0';

/**
 * The Scalar browser bundle, pinned to an exact version so a new upstream release
 * cannot change what runs on the docs page. Bump it deliberately (and test the page).
 * To serve it yourself instead of from the CDN, see docs/07-validation-and-api.md.
 */
const SCALAR_BUNDLE_URL = 'https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.83.0';

const DESCRIPTION = `
## Authentication

Send the access token on every request: \`Authorization: Bearer <accessToken>\`.

1. \`POST /auth/login\` (or \`/auth/register\`) returns an access token (short-lived) and a refresh token.
2. When a request fails with \`401 INVALID_ACCESS_TOKEN\`, call \`POST /auth/refresh\` and retry once.
3. Refresh tokens are single-use. Each refresh returns a new pair; replaying an old one revokes every session of that user.

Endpoints without a lock icon are public.

## Errors

Errors follow [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457) and are served as \`application/problem+json\`.
Branch on the stable \`code\` field (for example \`USER_NOT_FOUND\`), never on \`detail\`.

## Conventions

- **Request id:** every response carries \`X-Request-Id\`. Send your own to correlate, and quote it when reporting a problem.
- **Rate limits:** responses carry \`X-RateLimit-Limit\`, \`X-RateLimit-Remaining\` and \`X-RateLimit-Reset\`. A \`429\` includes \`Retry-After\`.
- **Pagination:** list endpoints take \`?page=&limit=\` and return \`{ items, meta }\`.
- **Dates:** ISO 8601 strings in UTC.
- **Caching:** responses are sent with \`Cache-Control: no-store\`.
`.trim();

const TAGS: ReadonlyArray<readonly [name: string, description: string]> = [
  ['Auth', 'Registration, login, token refresh and logout.'],
  ['Users', 'The current user profile, and user administration for admins.'],
  ['Health', 'Liveness and readiness probes for orchestrators.'],
];

interface ResponseObject {
  description?: string;
  content?: Record<string, { schema?: { $ref?: string } }>;
}
type OperationObject = Record<string, unknown> & {
  security?: unknown[];
  responses?: Record<string, ResponseObject>;
};

/**
 * Builds the OpenAPI 3 document from the controllers and their Zod schemas.
 *
 * `@nestjs/swagger` is used purely as the document generator; the UI is Scalar.
 * Also used by `pnpm openapi:export` to write the document to disk.
 */
export function createOpenApiDocument(app: NestExpressApplication): OpenAPIObject {
  const builder = new DocumentBuilder()
    .setTitle('Zed Nest API')
    .setDescription(DESCRIPTION)
    .setVersion(API_VERSION)
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'The `accessToken` returned by `POST /auth/login`.',
      },
      BEARER_AUTH,
    )
    .addSecurityRequirements(BEARER_AUTH);
  for (const [name, description] of TAGS) builder.addTag(name, description);

  const document = SwaggerModule.createDocument(app, builder.build(), {
    operationIdFactory: (controllerKey, methodKey) =>
      `${controllerKey.replace(/Controller$/, '')}_${methodKey}`,
  });

  for (const pathItem of Object.values(document.paths)) {
    for (const operation of Object.values(pathItem) as OperationObject[]) {
      if (typeof operation !== 'object') continue;
      const responses = operation.responses ?? {};

      // Routes marked @Public() need no token: drop the bearer requirement and the
      // "missing access token" response inherited from the controller.
      if (PUBLIC_ROUTE_EXTENSION in operation) {
        delete operation[PUBLIC_ROUTE_EXTENSION];
        operation.security = [];
        if (responses['401']?.description?.includes('INVALID_ACCESS_TOKEN')) {
          delete responses['401'];
        }
      }

      // Errors are served as application/problem+json, not application/json.
      for (const response of Object.values(responses)) {
        const json = response.content?.['application/json'];
        if (json?.schema?.$ref?.endsWith('/ProblemDetails') && response.content) {
          response.content = { [PROBLEM_CONTENT_TYPE]: json };
        }
      }
    }
  }
  return document;
}

/**
 * Content-Security-Policy for the docs page only. The rest of the API keeps the
 * locked-down policy set in app.setup.ts.
 *
 * Scripts run only with the per-request nonce (no `unsafe-inline`, no `unsafe-eval`).
 * `connect-src 'self'` lets the built-in request client call this API and nothing else.
 */
function docsContentSecurityPolicy(nonce: string): string {
  return [
    "default-src 'none'",
    `script-src 'nonce-${nonce}'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https://fonts.scalar.com",
    "connect-src 'self'",
    'worker-src blob:',
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
}

/**
 * Serves the API reference.
 *
 *   UI   (Scalar):  GET /docs
 *   JSON (OpenAPI): GET /docs/openapi.json   (feed it to client generators)
 *
 * Both routes sit outside the API prefix and need no token. They exist only when
 * `API_DOCS_ENABLED` is true (default: everywhere except production).
 */
export function setupApiDocs(app: NestExpressApplication): void {
  const http = app.getHttpAdapter().getInstance() as Express;
  let document: OpenAPIObject | undefined;

  http.get(`/${OPENAPI_JSON_PATH}`, (_req: Request, res: Response) => {
    // Built on first request: every controller is registered by then.
    document ??= createOpenApiDocument(app);
    res.json(document);
  });

  http.get(`/${DOCS_PATH}`, (req: Request, res: Response) => {
    const nonce = randomBytes(16).toString('base64');
    res.setHeader('Content-Security-Policy', docsContentSecurityPolicy(nonce));

    const render = apiReference({
      url: `/${OPENAPI_JSON_PATH}`,
      pageTitle: 'Zed Nest API',
      cdn: SCALAR_BUNDLE_URL,
      nonce,
      // Keep the page self-contained: no usage telemetry, no hosted AI assistant, no
      // "share / deploy to Scalar cloud" toolbar, and tokens typed into the page are
      // not written to localStorage.
      telemetry: false,
      agent: { disabled: true },
      showDeveloperTools: 'never',
      persistAuth: false,
      hideClientButton: true,
      defaultHttpClient: { targetKey: 'js', clientKey: 'fetch' },
    }) as (req: Request, res: Response) => void;
    render(req, res);
  });
}
