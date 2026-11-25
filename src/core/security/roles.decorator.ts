import { applyDecorators, SetMetadata } from '@nestjs/common';
import { ApiProblem } from '../http/problem-details.js';
import type { Role } from '../../shared/security/role.js';

export const ROLES_KEY = 'auth:roles';

/**
 * Restricts a controller/handler to users holding at least one of the given roles.
 *
 *   @Roles('admin')
 *   @Delete(':id') remove() {}
 */
export const Roles = (...roles: Role[]): MethodDecorator & ClassDecorator =>
  applyDecorators(
    SetMetadata(ROLES_KEY, roles),
    ApiProblem(403, `\`FORBIDDEN\`: requires role ${roles.join(' or ')}`),
  );
