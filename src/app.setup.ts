import { VersioningType } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import compression from 'compression';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import type { AppConfig } from './config/index.js';
import { REQUEST_ID_HEADER, requestIdMiddleware } from './core/http/request-id.middleware.js';
import { setupApiDocs } from './core/openapi/openapi.js';

const RATE_LIMIT_HEADERS = [
  'X-RateLimit-Limit',
  'X-RateLimit-Remaining',
  'X-RateLimit-Reset',
  'Retry-After',
];

/**
 * HTTP-level application setup, shared by `main.ts` and the e2e tests so tests
 * exercise exactly the same pipeline as production.
 */
export function configureApp(app: NestExpressApplication, config: AppConfig): void {
  const { http } = config;

  // Must be first: everything downstream (logs, CLS, errors) relies on req.id.
  app.use(requestIdMiddleware);

  // Behind a proxy, req.ip / req.protocol come from X-Forwarded-*; trust exactly the
  // configured number of hops so clients cannot spoof their IP (and dodge rate limits).
  if (http.trustProxyHops > 0) app.set('trust proxy', http.trustProxyHops);
  app.disable('x-powered-by');

  app.use(
    helmet({
      // This is a JSON API: nothing it returns should ever load a resource or be framed.
      // The docs page sets its own, nonce-based policy (core/openapi/openapi.ts).
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'none'"],
          baseUri: ["'none'"],
          formAction: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
    }),
  );

  // API responses can hold personal data and tokens: never let a browser or shared
  // proxy store them. A handler that serves cacheable data can override with @Header().
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  app.use(compression());

  // A wildcard origin never gets credentials: reflecting any origin together with
  // `Access-Control-Allow-Credentials` would let every website make authenticated calls.
  const anyOrigin = http.corsOrigins.includes('*');
  app.enableCors({
    origin: anyOrigin ? '*' : [...http.corsOrigins],
    credentials: !anyOrigin,
    exposedHeaders: [REQUEST_ID_HEADER, ...RATE_LIMIT_HEADERS],
    maxAge: 600, // browsers cache the preflight for 10 minutes
  });

  app.useBodyParser('json', { limit: http.bodyLimit });
  app.useBodyParser('urlencoded', { limit: http.bodyLimit, extended: true });

  // => /api/v1/users, /api/health/live (health is version-neutral)
  app.setGlobalPrefix(http.apiPrefix);
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  if (http.docsEnabled) setupApiDocs(app);
}
