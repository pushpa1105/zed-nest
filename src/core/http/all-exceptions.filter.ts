import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { STATUS_CODES } from 'node:http';
import { translateDatabaseError } from '../../infrastructure/database/database-error.translator.js';
import { AppError, type ErrorDetail, type ErrorKind } from '../../shared/errors/index.js';
import { PROBLEM_CONTENT_TYPE, type ProblemDetails } from './problem-details.js';
import type { RequestWithId } from './request-id.middleware.js';

const STATUS_BY_KIND: Record<ErrorKind, number> = {
  validation: HttpStatus.BAD_REQUEST,
  bad_request: HttpStatus.BAD_REQUEST,
  unauthorized: HttpStatus.UNAUTHORIZED,
  forbidden: HttpStatus.FORBIDDEN,
  not_found: HttpStatus.NOT_FOUND,
  conflict: HttpStatus.CONFLICT,
  unprocessable: HttpStatus.UNPROCESSABLE_ENTITY,
  too_many_requests: HttpStatus.TOO_MANY_REQUESTS,
  unavailable: HttpStatus.SERVICE_UNAVAILABLE,
  internal: HttpStatus.INTERNAL_SERVER_ERROR,
};

interface NormalizedError {
  status: number;
  code: string;
  detail: string;
  errors?: readonly ErrorDetail[];
}

/**
 * The single place where errors become HTTP responses.
 *
 * Resolution order:
 *  1. `AppError` (domain/application errors)     → mapped by `kind`
 *  2. Database driver errors                      → translated (409 on unique violation, ...)
 *  3. Nest `HttpException` (404 route, 429, 413…) → kept as is
 *  4. Anything else                               → 500, details hidden from client, logged in full
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== 'http') throw exception;

    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();
    const normalized = this.normalize(exception);
    const requestId = (req as Partial<RequestWithId>).id ?? 'unknown';
    // `req.url` loses the global prefix inside mounted middleware; `originalUrl` never does.
    const path = (req.originalUrl ?? req.url).split('?')[0] ?? '';

    if (normalized.status >= 500) {
      this.logger.error({ err: exception, requestId }, `Unhandled error on ${req.method} ${path}`);
    } else {
      this.logger.debug({ code: normalized.code, requestId }, normalized.detail);
    }

    const body: ProblemDetails = {
      type: `urn:problem-type:${normalized.code.toLowerCase().replaceAll('_', '-')}`,
      title: STATUS_CODES[normalized.status] ?? 'Error',
      status: normalized.status,
      detail: normalized.detail,
      instance: path,
      code: normalized.code,
      requestId,
      ...(normalized.errors?.length ? { errors: [...normalized.errors] } : {}),
    };

    if (res.headersSent) return;
    res.status(normalized.status).type(PROBLEM_CONTENT_TYPE).json(body);
  }

  private normalize(exception: unknown): NormalizedError {
    const appError = exception instanceof AppError ? exception : translateDatabaseError(exception);
    if (appError) {
      return {
        status: STATUS_BY_KIND[appError.kind],
        code: appError.code,
        detail: appError.message,
        errors: appError.details,
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      const message =
        typeof response === 'object' && response !== null && 'message' in response
          ? (response as { message: unknown }).message
          : exception.message;
      const messages = Array.isArray(message) ? message.map(String) : [String(message)];
      return {
        status,
        code: (STATUS_CODES[status] ?? 'ERROR').toUpperCase().replace(/[^A-Z0-9]+/g, '_'),
        detail: messages[0] ?? exception.message,
        errors: messages.length > 1 ? messages.map((m) => ({ message: m })) : undefined,
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_ERROR',
      detail: 'An unexpected error occurred',
    };
  }
}
