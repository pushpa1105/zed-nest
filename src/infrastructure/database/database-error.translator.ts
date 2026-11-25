import {
  BadRequestError,
  ConflictError,
  ServiceUnavailableError,
  type AppError,
} from '../../shared/errors/index.js';

/**
 * Translates driver-specific database errors into transport-agnostic `AppError`s.
 *
 * This is the only file that knows PostgreSQL error codes. When switching DB
 * engine, add the equivalent codes for the new driver here.
 *
 * Repositories may also catch & translate specific constraint violations into
 * richer domain errors (e.g. `UserEmailTakenError`) — this is the safety net.
 *
 * Postgres codes: https://www.postgresql.org/docs/current/errcodes-appendix.html
 */
const PG = {
  UNIQUE_VIOLATION: '23505',
  FOREIGN_KEY_VIOLATION: '23503',
  NOT_NULL_VIOLATION: '23502',
  CHECK_VIOLATION: '23514',
  INVALID_TEXT_REPRESENTATION: '22P02',
  QUERY_CANCELED: '57014',
  TOO_MANY_CONNECTIONS: '53300',
} as const;

const CONNECTION_ERROR_CODES = new Set(['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND']);

interface DriverError {
  code?: string;
  constraint?: string;
  detail?: string;
}

function asDriverError(error: unknown): DriverError | undefined {
  return typeof error === 'object' && error !== null && 'code' in error
    ? (error as DriverError)
    : undefined;
}

export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  const e = asDriverError(error);
  return e?.code === PG.UNIQUE_VIOLATION && (!constraint || e.constraint === constraint);
}

export function translateDatabaseError(error: unknown): AppError | undefined {
  const e = asDriverError(error);
  if (!e?.code) return undefined;

  switch (e.code) {
    case PG.UNIQUE_VIOLATION:
      return new ConflictError('Resource already exists', 'UNIQUE_VIOLATION', [
        { message: 'A record with the same unique value already exists', constraint: e.constraint },
      ]);
    case PG.FOREIGN_KEY_VIOLATION:
      return new ConflictError(
        'Related resource missing or still referenced',
        'FOREIGN_KEY_VIOLATION',
        [{ message: 'Referential integrity violated', constraint: e.constraint }],
      );
    case PG.NOT_NULL_VIOLATION:
    case PG.CHECK_VIOLATION:
    case PG.INVALID_TEXT_REPRESENTATION:
      return new BadRequestError('Invalid data for this operation', 'INVALID_DATA');
    case PG.QUERY_CANCELED:
    case PG.TOO_MANY_CONNECTIONS:
      return new ServiceUnavailableError('Database is busy, please retry', 'DATABASE_BUSY');
    default:
      return CONNECTION_ERROR_CODES.has(e.code)
        ? new ServiceUnavailableError('Database unavailable', 'DATABASE_UNAVAILABLE')
        : undefined;
  }
}
