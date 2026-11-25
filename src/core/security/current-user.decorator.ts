import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthenticatedUser } from '../../shared/security/role.js';
import { UnauthorizedError } from '../../shared/errors/index.js';

export interface RequestWithUser {
  user?: AuthenticatedUser;
}

/**
 * Injects the authenticated user (set by the global AuthGuard).
 *
 *   @Get('me') me(@CurrentUser() user: AuthenticatedUser) {}
 *   @Get('me') me(@CurrentUser('id') userId: string) {}
 */
export const CurrentUser = createParamDecorator(
  (field: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const user = ctx.switchToHttp().getRequest<RequestWithUser>().user;
    if (!user) throw new UnauthorizedError();
    return field ? user[field] : user;
  },
);
