import { Body, Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { ApiProblem, ApiProblemResponses } from '../../../core/http/problem-details.js';
import { CurrentUser, Public, type AuthenticatedUser } from '../../../core/security/index.js';
import { toUserResponse } from '../../users/index.js';
import {
  AuthService,
  type AuthResult,
  type ClientContext,
  type TokenPair,
} from '../application/auth.service.js';
import {
  authResponseSchema,
  loginSchema,
  refreshSchema,
  registerSchema,
  tokenPairSchema,
  type AuthResponse,
  type LoginRequest,
  type RefreshRequest,
  type RegisterRequest,
} from './auth.schemas.js';

/** Stricter rate limits on credential endpoints to slow brute-force attacks. */
const CREDENTIALS_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

@ApiTags('Auth')
@ApiProblemResponses()
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle(CREDENTIALS_THROTTLE)
  @Post('register')
  @ApiOperation({ summary: 'Create an account and start a session' })
  @ApiCreatedResponse({ standardSchema: authResponseSchema })
  @ApiProblem(409, '`USER_EMAIL_TAKEN`: the email is already registered')
  async register(
    @Body({ schema: registerSchema }) body: RegisterRequest,
    @Req() req: Request,
  ): Promise<AuthResponse> {
    return present(await this.auth.register(body, clientContext(req)));
  }

  @Public()
  @Throttle(CREDENTIALS_THROTTLE)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange credentials for tokens' })
  @ApiOkResponse({ standardSchema: authResponseSchema })
  @ApiProblem(401, '`INVALID_CREDENTIALS`: wrong email or password')
  async login(
    @Body({ schema: loginSchema }) body: LoginRequest,
    @Req() req: Request,
  ): Promise<AuthResponse> {
    return present(await this.auth.login(body.email, body.password, clientContext(req)));
  }

  @Public()
  @Throttle(CREDENTIALS_THROTTLE)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Rotate the refresh token and get a new access token',
    description:
      'Refresh tokens are single-use. Store the returned pair and discard the old one: ' +
      'presenting a token that was already rotated revokes every session of the user.',
  })
  @ApiOkResponse({ standardSchema: tokenPairSchema })
  @ApiProblem(
    401,
    '`INVALID_REFRESH_TOKEN`: invalid, expired, revoked or already used. Send the user to login.',
  )
  refresh(@Body({ schema: refreshSchema }) body: RefreshRequest): Promise<TokenPair> {
    return this.auth.refresh(body.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Revoke the current session',
    description:
      'The refresh token stops working immediately. The access token stays valid until it expires.',
  })
  @ApiNoContentResponse()
  async logout(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.auth.logout(user.sessionId);
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke every session of the current user (all devices)' })
  @ApiNoContentResponse()
  async logoutAll(@CurrentUser('id') userId: string): Promise<void> {
    await this.auth.logoutAll(userId);
  }
}

function clientContext(req: Request): ClientContext {
  return { userAgent: req.headers['user-agent'], ipAddress: req.ip };
}

function present(result: AuthResult): AuthResponse {
  return { user: toUserResponse(result.user), tokens: result.tokens };
}
