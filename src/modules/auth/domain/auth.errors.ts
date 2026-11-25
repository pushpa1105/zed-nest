import { UnauthorizedError } from '../../../shared/errors/index.js';

export class InvalidCredentialsError extends UnauthorizedError {
  constructor() {
    super('Invalid email or password', 'INVALID_CREDENTIALS');
  }
}

export class InvalidAccessTokenError extends UnauthorizedError {
  constructor() {
    super('Access token is missing, invalid or expired', 'INVALID_ACCESS_TOKEN');
  }
}

export class InvalidRefreshTokenError extends UnauthorizedError {
  constructor() {
    super('Refresh token is invalid, expired or revoked', 'INVALID_REFRESH_TOKEN');
  }
}
