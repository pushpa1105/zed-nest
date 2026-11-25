import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { RequestWithUser } from '../../../core/security/current-user.decorator.js';
import { IS_PUBLIC_KEY } from '../../../core/security/public.decorator.js';
import { ROLES_KEY } from '../../../core/security/roles.decorator.js';
import { ForbiddenError } from '../../../shared/errors/index.js';
import type { Role } from '../../../shared/security/role.js';
import { TokenService } from '../application/token.service.js';
import { InvalidAccessTokenError } from '../domain/auth.errors.js';

/**
 * Global guard (registered as APP_GUARD in AuthModule):
 *  1. `@Public()` routes pass through.
 *  2. Otherwise a valid `Authorization: Bearer <accessToken>` is required → `req.user`.
 *  3. `@Roles(...)` metadata, when present, must match the user's role.
 *
 * Secure by default: forgetting a decorator results in a locked endpoint, not an open one.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const targets = [context.getHandler(), context.getClass()];

    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;

    const request = context.switchToHttp().getRequest<Request & RequestWithUser>();
    const token = extractBearerToken(request.headers.authorization);
    if (!token) throw new InvalidAccessTokenError();

    const user = await this.tokens.verifyAccessToken(token);
    request.user = user;

    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, targets);
    if (roles?.length && !roles.includes(user.role)) throw new ForbiddenError();

    return true;
  }
}

function extractBearerToken(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : undefined;
}
