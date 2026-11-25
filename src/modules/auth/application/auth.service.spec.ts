import { JwtService } from '@nestjs/jwt';
import { AppConfig, parseEnv } from '../../../config/index.js';
import { UsersService } from '../../users/index.js';
import { FakePasswordHasher } from '../../users/testing/fake-password-hasher.js';
import { InMemoryUserRepository } from '../../users/testing/in-memory-user.repository.js';
import { InvalidCredentialsError, InvalidRefreshTokenError } from '../domain/auth.errors.js';
import type { Session } from '../domain/session.js';
import { SessionRepository, type NewSession } from '../domain/session.repository.js';
import { AuthService } from './auth.service.js';
import { TokenService } from './token.service.js';

// `@Transactional()` needs the CLS context, which unit tests do not have. Make it a no-op.
vi.mock(import('@nestjs-cls/transactional'), async (importOriginal) => ({
  ...(await importOriginal()),
  Transactional: (() => (_t: unknown, _k: string, descriptor: PropertyDescriptor) =>
    descriptor) as never,
}));

class InMemorySessionRepository extends SessionRepository {
  readonly rows = new Map<string, Session>();

  async create(s: NewSession) {
    this.rows.set(s.id, { ...s, revokedAt: null, createdAt: new Date() });
  }
  async findById(id: string) {
    return this.rows.get(id) ?? null;
  }
  async rotate(id: string, expected: string, next: string, expiresAt: Date) {
    const s = this.rows.get(id);
    if (!s || s.revokedAt || s.refreshTokenHash !== expected) return false;
    this.rows.set(id, { ...s, refreshTokenHash: next, expiresAt });
    return true;
  }
  async revoke(id: string) {
    const s = this.rows.get(id);
    if (s) this.rows.set(id, { ...s, revokedAt: new Date() });
  }
  async revokeAllForUser(userId: string) {
    let n = 0;
    for (const s of this.rows.values()) {
      if (s.userId === userId && !s.revokedAt) {
        this.rows.set(s.id, { ...s, revokedAt: new Date() });
        n++;
      }
    }
    return n;
  }
  async deleteExpired() {
    return 0;
  }
}

const config = new AppConfig(
  parseEnv({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgres://u:p@localhost:5432/db',
    JWT_ACCESS_SECRET: 'a'.repeat(32),
    JWT_REFRESH_SECRET: 'b'.repeat(32),
  }),
);

describe('AuthService', () => {
  let auth: AuthService;
  let sessions: InMemorySessionRepository;

  beforeEach(() => {
    sessions = new InMemorySessionRepository();
    const users = new UsersService(new InMemoryUserRepository(), new FakePasswordHasher(), {
      emit: vi.fn(),
    } as never);
    auth = new AuthService(users, sessions, new TokenService(new JwtService(), config));
  });

  const signUp = () =>
    auth.register({ email: 'jane@example.com', password: 'Secret123', displayName: 'Jane' }, {});

  it('register returns a user and a token pair, and opens a session', async () => {
    const result = await signUp();
    expect(result.user.email).toBe('jane@example.com');
    expect(result.tokens).toMatchObject({ tokenType: 'Bearer', expiresIn: 900 });
    expect(sessions.rows.size).toBe(1);
  });

  it('login rejects bad credentials', async () => {
    await signUp();
    await expect(auth.login('jane@example.com', 'wrong', {})).rejects.toBeInstanceOf(
      InvalidCredentialsError,
    );
  });

  it('refresh rotates the token', async () => {
    const { tokens } = await signUp();
    const next = await auth.refresh(tokens.refreshToken);
    expect(next.refreshToken).not.toBe(tokens.refreshToken);
    await expect(auth.refresh(next.refreshToken)).resolves.toBeDefined();
  });

  it('replaying a rotated refresh token revokes every session (reuse detection)', async () => {
    const { tokens } = await signUp();
    await auth.login('jane@example.com', 'Secret123', {}); // second device
    const rotated = await auth.refresh(tokens.refreshToken);

    await expect(auth.refresh(tokens.refreshToken)).rejects.toBeInstanceOf(
      InvalidRefreshTokenError,
    );
    expect([...sessions.rows.values()].every((s) => s.revokedAt !== null)).toBe(true);
    await expect(auth.refresh(rotated.refreshToken)).rejects.toBeInstanceOf(
      InvalidRefreshTokenError,
    );
  });

  it('rejects an access token used as a refresh token', async () => {
    const { tokens } = await signUp();
    await expect(auth.refresh(tokens.accessToken)).rejects.toBeInstanceOf(InvalidRefreshTokenError);
  });
});
