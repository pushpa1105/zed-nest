import { SessionCleanupService } from '../src/modules/auth/application/session-cleanup.service.js';
import { API, createTestApp, registerUser, type TestApp } from './helpers/test-app.js';

describe('Auth (e2e)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  beforeEach(() => t.reset());
  afterAll(() => t.close());

  describe('POST /auth/register', () => {
    it('creates the user and returns tokens', async () => {
      const res = await t
        .http()
        .post(`${API}/auth/register`)
        .send({ email: 'Jane@Example.com', password: 'Secret123', displayName: 'Jane' })
        .expect(201);

      expect(res.body.user).toMatchObject({ email: 'jane@example.com', role: 'user' });
      expect(res.body.user).not.toHaveProperty('passwordHash');
      expect(res.body.tokens).toMatchObject({ tokenType: 'Bearer', expiresIn: expect.any(Number) });
      expect(res.headers['x-request-id']).toBeDefined();
    });

    it('returns 400 problem+json with field errors', async () => {
      const res = await t
        .http()
        .post(`${API}/auth/register`)
        .send({ email: 'nope', password: 'x' })
        .expect(400);

      expect(res.headers['content-type']).toContain('application/problem+json');
      expect(res.body.code).toBe('VALIDATION_FAILED');
      expect(res.body.errors.map((e: { path: string }) => e.path)).toEqual(
        expect.arrayContaining(['email', 'password', 'displayName']),
      );
    });

    it('returns 409 for a duplicate email', async () => {
      await registerUser(t, { email: 'dup@example.com' });
      const res = await t
        .http()
        .post(`${API}/auth/register`)
        .send({ email: 'DUP@example.com', password: 'Secret123', displayName: 'Dup' })
        .expect(409);
      expect(res.body.code).toBe('USER_EMAIL_TAKEN');
    });
  });

  describe('POST /auth/login', () => {
    it('accepts valid credentials and rejects invalid ones', async () => {
      const user = await registerUser(t);
      await t
        .http()
        .post(`${API}/auth/login`)
        .send({ email: user.email, password: user.password })
        .expect(200);

      const res = await t
        .http()
        .post(`${API}/auth/login`)
        .send({ email: user.email, password: 'Wrong123' })
        .expect(401);
      expect(res.body.code).toBe('INVALID_CREDENTIALS');
    });
  });

  describe('refresh token rotation', () => {
    it('rotates tokens and detects reuse', async () => {
      const { tokens } = await registerUser(t);

      const first = await t
        .http()
        .post(`${API}/auth/refresh`)
        .send({ refreshToken: tokens.refreshToken })
        .expect(200);
      expect(first.body.refreshToken).not.toBe(tokens.refreshToken);

      // Replaying the old token → reuse detected → whole family revoked
      await t
        .http()
        .post(`${API}/auth/refresh`)
        .send({ refreshToken: tokens.refreshToken })
        .expect(401);
      await t
        .http()
        .post(`${API}/auth/refresh`)
        .send({ refreshToken: first.body.refreshToken })
        .expect(401);
    });
  });

  describe('POST /auth/logout', () => {
    it('revokes the current session', async () => {
      const { tokens } = await registerUser(t);
      await t
        .http()
        .post(`${API}/auth/logout`)
        .auth(tokens.accessToken, { type: 'bearer' })
        .expect(204);
      await t
        .http()
        .post(`${API}/auth/refresh`)
        .send({ refreshToken: tokens.refreshToken })
        .expect(401);
    });
  });

  describe('password change', () => {
    it('revokes every session of the user', async () => {
      const user = await registerUser(t);
      const other = await t
        .http()
        .post(`${API}/auth/login`)
        .send({ email: user.email, password: user.password })
        .expect(200);

      await t
        .http()
        .post(`${API}/users/me/password`)
        .auth(user.tokens.accessToken, { type: 'bearer' })
        .send({ currentPassword: user.password, newPassword: 'NewSecret456' })
        .expect(204);

      for (const refreshToken of [user.tokens.refreshToken, other.body.tokens.refreshToken]) {
        const res = await t.http().post(`${API}/auth/refresh`).send({ refreshToken }).expect(401);
        expect(res.body.code).toBe('INVALID_REFRESH_TOKEN');
      }
      await t
        .http()
        .post(`${API}/auth/login`)
        .send({ email: user.email, password: 'NewSecret456' })
        .expect(200);
    });

    it('keeps the sessions when the current password is wrong', async () => {
      const user = await registerUser(t);
      await t
        .http()
        .post(`${API}/users/me/password`)
        .auth(user.tokens.accessToken, { type: 'bearer' })
        .send({ currentPassword: 'Wrong12345', newPassword: 'NewSecret456' })
        .expect(422);
      await t
        .http()
        .post(`${API}/auth/refresh`)
        .send({ refreshToken: user.tokens.refreshToken })
        .expect(200);
    });

    it('rolls the password change back when session revocation fails', async () => {
      const user = await registerUser(t);
      const spy = vi
        .spyOn(
          (await import('../src/modules/auth/infrastructure/kysely-session.repository.js'))
            .KyselySessionRepository.prototype,
          'revokeAllForUser',
        )
        .mockRejectedValueOnce(new Error('boom'));

      await t
        .http()
        .post(`${API}/users/me/password`)
        .auth(user.tokens.accessToken, { type: 'bearer' })
        .send({ currentPassword: user.password, newPassword: 'NewSecret456' })
        .expect(500);
      spy.mockRestore();

      // The old password still works: nothing was committed.
      await t
        .http()
        .post(`${API}/auth/login`)
        .send({ email: user.email, password: user.password })
        .expect(200);
    });
  });

  describe('session cleanup', () => {
    it('deletes expired sessions and keeps live ones', async () => {
      const expired = await registerUser(t);
      const live = await registerUser(t);
      await t.db
        .updateTable('authSessions')
        .set({ expiresAt: new Date(Date.now() - 1000), updatedAt: new Date() })
        .where('userId', '=', expired.id)
        .execute();

      expect(await t.app.get(SessionCleanupService).run()).toBe(1);

      const left = await t.db.selectFrom('authSessions').select('userId').execute();
      expect(left.map((s) => s.userId)).toEqual([live.id]);
    });
  });

  describe('transactions', () => {
    it('rolls back the user insert when session creation fails', async () => {
      const email = 'rollback@example.com';
      const spy = vi
        .spyOn(
          (await import('../src/modules/auth/infrastructure/kysely-session.repository.js'))
            .KyselySessionRepository.prototype,
          'create',
        )
        .mockRejectedValueOnce(new Error('boom'));

      await t
        .http()
        .post(`${API}/auth/register`)
        .send({ email, password: 'Secret123', displayName: 'R' })
        .expect(500);
      spy.mockRestore();

      const row = await t.db
        .selectFrom('users')
        .select('id')
        .where('email', '=', email)
        .executeTakeFirst();
      expect(row).toBeUndefined();
    });
  });
});
