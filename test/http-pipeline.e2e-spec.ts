import { API, createTestApp, registerUser, type TestApp } from './helpers/test-app.js';

/** Cross-cutting HTTP behaviour: security headers, CORS, error shapes for bad input. */
describe('HTTP pipeline (e2e)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp({ CORS_ORIGINS: 'https://app.example.com' });
  });
  beforeEach(() => t.reset());
  afterAll(() => t.close());

  describe('security headers', () => {
    it('locks every API response down', async () => {
      const res = await t.http().get('/api/health/live').expect(200);

      expect(res.headers['content-security-policy']).toBe(
        "default-src 'none';base-uri 'none';form-action 'none';frame-ancestors 'none'",
      );
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['strict-transport-security']).toContain('max-age=');
      expect(res.headers['x-frame-options']).toBeDefined();
      expect(res.headers['referrer-policy']).toBe('no-referrer');
      expect(res.headers['x-powered-by']).toBeUndefined();
    });

    it('forbids caching, including responses that carry tokens', async () => {
      const res = await t
        .http()
        .post(`${API}/auth/register`)
        .send({ email: 'cache@example.com', password: 'Secret123', displayName: 'C' })
        .expect(201);
      expect(res.headers['cache-control']).toBe('no-store');
    });

    it('does not serve the API reference when docs are disabled', async () => {
      await t.http().get('/docs').expect(404);
      await t.http().get('/docs/openapi.json').expect(404);
    });
  });

  describe('CORS', () => {
    it('allows a listed origin, with credentials', async () => {
      const res = await t
        .http()
        .options(`${API}/users/me`)
        .set('Origin', 'https://app.example.com')
        .set('Access-Control-Request-Method', 'GET')
        .expect(204);
      expect(res.headers['access-control-allow-origin']).toBe('https://app.example.com');
      expect(res.headers['access-control-allow-credentials']).toBe('true');
      expect(res.headers['access-control-max-age']).toBe('600');
    });

    it('does not allow an unlisted origin', async () => {
      const res = await t
        .http()
        .get('/api/health/live')
        .set('Origin', 'https://evil.example.com')
        .expect(200);
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('malformed requests', () => {
    it('returns 400 problem+json for invalid JSON', async () => {
      const res = await t
        .http()
        .post(`${API}/auth/login`)
        .set('Content-Type', 'application/json')
        .send('{"email": ')
        .expect(400);
      expect(res.headers['content-type']).toContain('application/problem+json');
      expect(res.body.requestId).toBeDefined();
    });

    it('returns 413 for a body over the limit', async () => {
      const res = await t
        .http()
        .post(`${API}/auth/login`)
        .send({ email: 'a@example.com', password: 'x'.repeat(2 * 1024 * 1024) })
        .expect(413);
      expect(res.headers['content-type']).toContain('application/problem+json');
    });

    it('returns 404 problem+json for an unknown route', async () => {
      const res = await t.http().get(`${API}/nope`).expect(404);
      expect(res.headers['content-type']).toContain('application/problem+json');
      expect(res.body.code).toBe('NOT_FOUND');
    });

    it('rejects a malformed or tampered bearer token', async () => {
      const { tokens } = await registerUser(t);
      for (const token of ['garbage', `${tokens.accessToken}x`, tokens.refreshToken]) {
        const res = await t
          .http()
          .get(`${API}/users/me`)
          .auth(token, { type: 'bearer' })
          .expect(401);
        expect(res.body.code).toBe('INVALID_ACCESS_TOKEN');
      }
    });
  });
});

describe('HTTP pipeline with a wildcard CORS origin (e2e)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp({ CORS_ORIGINS: '*' });
  });
  afterAll(() => t.close());

  it('never combines the wildcard with credentials', async () => {
    const res = await t
      .http()
      .get('/api/health/live')
      .set('Origin', 'https://anything.example.com')
      .expect(200);
    expect(res.headers['access-control-allow-origin']).toBe('*');
    expect(res.headers['access-control-allow-credentials']).toBeUndefined();
  });
});
