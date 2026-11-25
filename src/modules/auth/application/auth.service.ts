import { Injectable, Logger } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import { generateId } from '../../../shared/utils/id.js';
import { UsersService, type RegisterUserInput, type User } from '../../users/index.js';
import { InvalidCredentialsError, InvalidRefreshTokenError } from '../domain/auth.errors.js';
import { isSessionActive } from '../domain/session.js';
import { SessionRepository } from '../domain/session.repository.js';
import { TokenService } from './token.service.js';

export interface ClientContext {
  userAgent?: string;
  ipAddress?: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  /** Access-token lifetime in seconds. */
  expiresIn: number;
}

export interface AuthResult {
  user: User;
  tokens: TokenPair;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly users: UsersService,
    private readonly sessions: SessionRepository,
    private readonly tokens: TokenService,
  ) {}

  /**
   * Creates the user AND its first session atomically: `@Transactional()` makes
   * every repository call below (even inside UsersService) share one DB
   * transaction — if session creation fails, the user insert is rolled back.
   */
  @Transactional()
  async register(
    input: Omit<RegisterUserInput, 'role'>,
    client: ClientContext,
  ): Promise<AuthResult> {
    const user = await this.users.register(input);
    return { user, tokens: await this.startSession(user, client) };
  }

  async login(email: string, password: string, client: ClientContext): Promise<AuthResult> {
    const user = await this.users.verifyCredentials(email, password);
    if (!user) throw new InvalidCredentialsError();
    return { user, tokens: await this.startSession(user, client) };
  }

  /**
   * Refresh-token rotation with reuse detection (OAuth 2.0 Security BCP):
   * a token can be used once; replaying an already-rotated token revokes
   * every session of the user, cutting off an attacker holding a stolen token.
   *
   * Deliberately NOT @Transactional: the revocation must persist even though we throw.
   */
  async refresh(refreshToken: string): Promise<TokenPair> {
    const { userId, sessionId } = await this.tokens.verifyRefreshToken(refreshToken);
    const session = await this.sessions.findById(sessionId);
    if (!session || session.userId !== userId || !isSessionActive(session)) {
      throw new InvalidRefreshTokenError();
    }

    const presentedHash = this.tokens.hash(refreshToken);
    const next = await this.tokens.issueRefreshToken(userId, sessionId);
    const rotated =
      session.refreshTokenHash === presentedHash &&
      (await this.sessions.rotate(
        sessionId,
        presentedHash,
        this.tokens.hash(next.token),
        next.expiresAt,
      ));

    if (!rotated) {
      const revoked = await this.sessions.revokeAllForUser(userId);
      this.logger.warn(
        { userId, sessionId, revoked },
        'Refresh token reuse detected — all sessions revoked',
      );
      throw new InvalidRefreshTokenError();
    }

    const user = await this.users.getById(userId); // picks up role changes
    const access = await this.tokens.issueAccessToken(user, sessionId);
    return this.toPair(access.token, next.token);
  }

  async logout(sessionId: string): Promise<void> {
    await this.sessions.revoke(sessionId);
  }

  async logoutAll(userId: string): Promise<void> {
    await this.sessions.revokeAllForUser(userId);
  }

  private async startSession(user: User, client: ClientContext): Promise<TokenPair> {
    const sessionId = generateId();
    const refresh = await this.tokens.issueRefreshToken(user.id, sessionId);
    await this.sessions.create({
      id: sessionId,
      userId: user.id,
      refreshTokenHash: this.tokens.hash(refresh.token),
      userAgent: client.userAgent?.slice(0, 512) ?? null,
      ipAddress: client.ipAddress?.slice(0, 64) ?? null,
      expiresAt: refresh.expiresAt,
    });
    const access = await this.tokens.issueAccessToken(user, sessionId);
    return this.toPair(access.token, refresh.token);
  }

  private toPair(accessToken: string, refreshToken: string): TokenPair {
    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.tokens.accessTokenTtlSeconds,
    };
  }
}
