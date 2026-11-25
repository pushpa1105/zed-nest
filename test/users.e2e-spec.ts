import { API, createAdmin, createTestApp, registerUser, type TestApp } from './helpers/test-app.js';

describe('Users (e2e)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  beforeEach(() => t.reset());
  afterAll(() => t.close());

  it('rejects requests without a token (secure by default)', async () => {
    const res = await t.http().get(`${API}/users/me`).expect(401);
    expect(res.body.code).toBe('INVALID_ACCESS_TOKEN');
  });

  it('GET/PATCH /users/me', async () => {
    const user = await registerUser(t);
    const auth = { type: 'bearer' } as const;

    const me = await t
      .http()
      .get(`${API}/users/me`)
      .auth(user.tokens.accessToken, auth)
      .expect(200);
    expect(me.body.email).toBe(user.email);

    const updated = await t
      .http()
      .patch(`${API}/users/me`)
      .auth(user.tokens.accessToken, auth)
      .send({ displayName: '  New Name ' })
      .expect(200);
    expect(updated.body.displayName).toBe('New Name');
  });

  it('enforces roles on admin endpoints', async () => {
    const user = await registerUser(t);
    await t
      .http()
      .get(`${API}/users`)
      .auth(user.tokens.accessToken, { type: 'bearer' })
      .expect(403);
  });

  it('lists users with pagination and search (admin)', async () => {
    const admin = await createAdmin(t);
    await registerUser(t, { email: 'alice@example.com', displayName: 'Alice' });
    await registerUser(t, { email: 'bob@example.com', displayName: 'Bob' });

    const res = await t
      .http()
      .get(`${API}/users`)
      .query({ search: 'ali', limit: 10 })
      .auth(admin.tokens.accessToken, { type: 'bearer' })
      .expect(200);

    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].email).toBe('alice@example.com');
    expect(res.body.meta).toEqual({ page: 1, limit: 10, totalItems: 1, totalPages: 1 });
  });

  it('validates path params and returns 404 for unknown users', async () => {
    const admin = await createAdmin(t);
    const auth = { type: 'bearer' } as const;

    await t.http().get(`${API}/users/not-a-uuid`).auth(admin.tokens.accessToken, auth).expect(400);
    const res = await t
      .http()
      .get(`${API}/users/01a20f30-abb2-742e-9f00-11497b6ff037`)
      .auth(admin.tokens.accessToken, auth)
      .expect(404);
    expect(res.body.code).toBe('USER_NOT_FOUND');
  });

  it('admin can change roles and delete users, but not themselves', async () => {
    const admin = await createAdmin(t);
    const user = await registerUser(t);
    const auth = { type: 'bearer' } as const;

    const promoted = await t
      .http()
      .patch(`${API}/users/${user.id}/role`)
      .auth(admin.tokens.accessToken, auth)
      .send({ role: 'admin' })
      .expect(200);
    expect(promoted.body.role).toBe('admin');

    await t
      .http()
      .delete(`${API}/users/${admin.id}`)
      .auth(admin.tokens.accessToken, auth)
      .expect(403);
    await t
      .http()
      .delete(`${API}/users/${user.id}`)
      .auth(admin.tokens.accessToken, auth)
      .expect(204);
    await t.http().get(`${API}/users/${user.id}`).auth(admin.tokens.accessToken, auth).expect(404);
  });
});
