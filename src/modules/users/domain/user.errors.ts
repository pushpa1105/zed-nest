import {
  BusinessRuleError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../../shared/errors/index.js';

/** Feature-specific errors with stable codes. Clients may rely on these codes. */

export class UserNotFoundError extends NotFoundError {
  constructor(id: string) {
    super(`User ${id} not found`, 'USER_NOT_FOUND');
  }
}

export class UserEmailTakenError extends ConflictError {
  constructor(email: string) {
    super(`Email ${email} is already registered`, 'USER_EMAIL_TAKEN', [
      { path: 'email', message: 'Email is already registered' },
    ]);
  }
}

export class InvalidCurrentPasswordError extends BusinessRuleError {
  constructor() {
    super('Current password is incorrect', 'INVALID_CURRENT_PASSWORD', [
      { path: 'currentPassword', message: 'Current password is incorrect' },
    ]);
  }
}

export class CannotModifySelfError extends ForbiddenError {
  constructor(action: string) {
    super(`You cannot ${action} your own account`, 'CANNOT_MODIFY_SELF');
  }
}
