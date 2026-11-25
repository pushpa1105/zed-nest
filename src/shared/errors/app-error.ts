/**
 * Application error hierarchy.
 *
 * Domain and application code throw these — never `HttpException`. The global
 * exception filter (core/http/all-exceptions.filter.ts) is the ONLY place that
 * maps them to HTTP status codes. This keeps business logic transport-agnostic
 * (the same services can back HTTP, GraphQL, queues, CLIs, ...).
 *
 * Each error carries:
 *  - `kind`    → the category, mapped to a transport status (404, 409, ...)
 *  - `code`    → a stable, machine-readable identifier clients can switch on
 *                (e.g. `USER_EMAIL_TAKEN`). Never change a published code.
 *  - `details` → optional structured context (safe to expose to clients).
 */
export type ErrorKind =
  | 'validation'
  | 'bad_request'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'unprocessable'
  | 'too_many_requests'
  | 'unavailable'
  | 'internal';

export interface ErrorDetail {
  /** Dot-path of the offending field, e.g. `body.email`. */
  readonly path?: string;
  readonly message: string;
  readonly [key: string]: unknown;
}

export abstract class AppError extends Error {
  abstract readonly kind: ErrorKind;

  constructor(
    message: string,
    readonly code: string,
    readonly details?: readonly ErrorDetail[],
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  readonly kind = 'validation';
  constructor(details: readonly ErrorDetail[], message = 'Request validation failed') {
    super(message, 'VALIDATION_FAILED', details);
  }
}

export class BadRequestError extends AppError {
  readonly kind = 'bad_request';
  constructor(message: string, code = 'BAD_REQUEST', details?: readonly ErrorDetail[]) {
    super(message, code, details);
  }
}

export class UnauthorizedError extends AppError {
  readonly kind = 'unauthorized';
  constructor(message = 'Authentication required', code = 'UNAUTHORIZED') {
    super(message, code);
  }
}

export class ForbiddenError extends AppError {
  readonly kind = 'forbidden';
  constructor(message = 'You do not have permission to perform this action', code = 'FORBIDDEN') {
    super(message, code);
  }
}

export class NotFoundError extends AppError {
  readonly kind = 'not_found';
  constructor(message: string, code = 'NOT_FOUND') {
    super(message, code);
  }
}

export class ConflictError extends AppError {
  readonly kind = 'conflict';
  constructor(message: string, code = 'CONFLICT', details?: readonly ErrorDetail[]) {
    super(message, code, details);
  }
}

/** Input is well-formed but violates a business rule. */
export class BusinessRuleError extends AppError {
  readonly kind = 'unprocessable';
  constructor(message: string, code: string, details?: readonly ErrorDetail[]) {
    super(message, code, details);
  }
}

export class ServiceUnavailableError extends AppError {
  readonly kind = 'unavailable';
  constructor(message = 'Service temporarily unavailable', code = 'SERVICE_UNAVAILABLE') {
    super(message, code);
  }
}
