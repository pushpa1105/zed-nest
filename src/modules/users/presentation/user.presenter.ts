import type { User } from '../domain/user.js';
import type { UserResponse } from './users.schemas.js';

/**
 * Domain → API response. Explicit field picking means sensitive data
 * (e.g. `passwordHash`) can never leak by accident when the entity grows.
 */
export function toUserResponse(user: User): UserResponse {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}
