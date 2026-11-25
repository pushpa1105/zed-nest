/**
 * Public API of the users feature.
 * Other features import from here ONLY — never from users' internal folders.
 */
export { UsersModule } from './users.module.js';
export { UsersService, type RegisterUserInput } from './application/users.service.js';
export { User } from './domain/user.js';
export * from './domain/user.errors.js';
export * from './domain/user.events.js';
export { toUserResponse } from './presentation/user.presenter.js';
export {
  displayNameSchema,
  emailSchema,
  passwordSchema,
  userResponseSchema,
  type UserResponse,
} from './presentation/users.schemas.js';
