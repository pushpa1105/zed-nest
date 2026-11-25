import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomUUID } from 'node:crypto';
import { AppConfig } from '../../../config/index.js';
import { ROLES, type AuthenticatedUser, type Role } from '../../../shared/security/role.js';
import { InvalidAccessTokenError, InvalidRefreshTokenError } from '../domain/auth.errors.js';

interface AccessTokenClaims {
  sub: string;
  role: Role;
  sid: string;
  typ: 'access';
}

interface RefreshTokenClaims {
  sub: string;
  sid: string;
  typ: 'refresh';
  jti: string;
}

export interface IssuedToken {
  token: string;
  expiresAt: Date;
}

/**
 * Issues and verifies JWTs.
 *
 * - Access token: short-lived, stateless (verified by signature only).
 * - Refresh token: long-lived, bound to a DB session, rotated on each use.
 * - Separate secrets + a `typ` claim prevent using one token type as the other.
 * - Algorithm is pinned (HS256) to prevent algorithm-confusion attacks.
 *   For multi-service setups switch to RS256/EdDSA key pairs (docs/09-...).
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: AppConfig,
  ) {}

  get accessTokenTtlSeconds(): number {
    return this.config.auth.accessTtlSeconds;
  }

  async issueAccessToken(
    user: { id: string; role: Role },
    sessionId: string,
  ): Promise<IssuedToken> {
    const { accessSecret, accessTtlSeconds, issuer, audience } = this.config.auth;
    const claims: AccessTokenClaims = {
      sub: user.id,
      role: user.role,
      sid: sessionId,
      typ: 'access',
    };
    const token = await this.jwt.signAsync(claims, {
      secret: accessSecret,
      expiresIn: accessTtlSeconds,
      issuer,
      audience,
      algorithm: 'HS256',
    });
    return { token, expiresAt: new Date(Date.now() + accessTtlSeconds * 1000) };
  }

  async issueRefreshToken(userId: string, sessionId: string): Promise<IssuedToken> {
    const { refreshSecret, refreshTtlSeconds, issuer, audience } = this.config.auth;
    // `jti` makes every token unique even when issued within the same second.
    const claims: RefreshTokenClaims = {
      sub: userId,
      sid: sessionId,
      typ: 'refresh',
      jti: randomUUID(),
    };
    const token = await this.jwt.signAsync(claims, {
      secret: refreshSecret,
      expiresIn: refreshTtlSeconds,
      issuer,
      audience,
      algorithm: 'HS256',
    });
    return { token, expiresAt: new Date(Date.now() + refreshTtlSeconds * 1000) };
  }

  async verifyAccessToken(token: string): Promise<AuthenticatedUser> {
    const { accessSecret, issuer, audience } = this.config.auth;
    try {
      const claims = await this.jwt.verifyAsync<AccessTokenClaims>(token, {
        secret: accessSecret,
        issuer,
        audience,
        algorithms: ['HS256'],
      });
      if (claims.typ !== 'access' || !ROLES.includes(claims.role)) throw new Error('bad claims');
      return { id: claims.sub, role: claims.role, sessionId: claims.sid };
    } catch {
      throw new InvalidAccessTokenError();
    }
  }

  async verifyRefreshToken(token: string): Promise<{ userId: string; sessionId: string }> {
    const { refreshSecret, issuer, audience } = this.config.auth;
    try {
      const claims = await this.jwt.verifyAsync<RefreshTokenClaims>(token, {
        secret: refreshSecret,
        issuer,
        audience,
        algorithms: ['HS256'],
      });
      if (claims.typ !== 'refresh') throw new Error('bad claims');
      return { userId: claims.sub, sessionId: claims.sid };
    } catch {
      throw new InvalidRefreshTokenError();
    }
  }

  /** Tokens are stored hashed: a DB leak must not yield usable refresh tokens. */
  hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
