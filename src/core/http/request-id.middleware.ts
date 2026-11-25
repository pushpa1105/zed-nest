import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export const REQUEST_ID_HEADER = 'x-request-id';
const SAFE_ID = /^[\w.-]{1,128}$/;

export type RequestWithId = Request & { id: string };

/**
 * Assigns every request a correlation id — reusing an incoming `X-Request-Id`
 * from a gateway/load balancer when it is safe — and echoes it back in the
 * response. Logs (pino), CLS context and error responses all carry this id,
 * so one value traces a request across every log line and service.
 *
 * Registered first in app.setup.ts so everything downstream can rely on `req.id`.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers[REQUEST_ID_HEADER];
  const id = typeof incoming === 'string' && SAFE_ID.test(incoming) ? incoming : randomUUID();
  (req as RequestWithId).id = id;
  res.setHeader(REQUEST_ID_HEADER, id);
  next();
}
