import { createTestApp, type TestApp } from './helpers/test-app.js';

describe('Health (e2e)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());

  it('liveness is public and always up', async () => {
    const res = await t.http().get('/api/health/live').expect(200);
    expect(res.body.status).toBe('ok');
  });

  it('readiness checks the database', async () => {
    const res = await t.http().get('/api/health/ready').expect(200);
    expect(res.body.info.database.status).toBe('up');
  });

  it('echoes a safe incoming X-Request-Id', async () => {
    const res = await t
      .http()
      .get('/api/health/live')
      .set('X-Request-Id', 'trace-abc-123')
      .expect(200);
    expect(res.headers['x-request-id']).toBe('trace-abc-123');
  });
});
