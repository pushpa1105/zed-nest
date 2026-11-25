import { createTestApp, type TestApp } from './helpers/test-app.js';

describe('API reference (e2e)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp({ API_DOCS_ENABLED: 'true' });
  });
  afterAll(() => t.close());

  it('serves the Scalar page under a nonce-based CSP', async () => {
    const res = await t.http().get('/docs').expect(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('/docs/openapi.json');

    const csp = res.headers['content-security-policy'] as string;
    const nonce = /script-src 'nonce-([^']+)'/.exec(csp)?.[1];
    expect(nonce).toBeDefined();
    expect(csp).not.toContain("script-src 'unsafe-inline'");
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).toContain("connect-src 'self'");
    // Every <script> on the page carries the nonce.
    const scripts = res.text.match(/<script\b[^>]*>/g) ?? [];
    expect(scripts.length).toBeGreaterThan(0);
    for (const tag of scripts) expect(tag).toContain(`nonce="${nonce}"`);

    const again = await t.http().get('/docs').expect(200);
    expect(again.headers['content-security-policy']).not.toBe(csp); // fresh nonce per request
  });

  it('pins the Scalar bundle to an exact version', async () => {
    const res = await t.http().get('/docs').expect(200);
    expect(res.text).toMatch(/cdn\.jsdelivr\.net\/npm\/@scalar\/api-reference@\d+\.\d+\.\d+"/);
  });

  it('serves a complete OpenAPI document', async () => {
    const res = await t.http().get('/docs/openapi.json').expect(200);
    const doc = res.body;

    expect(doc.openapi).toMatch(/^3\./);
    expect(doc.components.securitySchemes['access-token']).toMatchObject({
      type: 'http',
      scheme: 'bearer',
    });
    expect(doc.security).toEqual([{ 'access-token': [] }]);
    expect(Object.keys(doc.components.schemas)).toEqual(
      expect.arrayContaining(['User', 'AuthResponse', 'TokenPair', 'ProblemDetails', 'UserPage']),
    );
    expect(Object.keys(doc.paths)).toEqual(
      expect.arrayContaining([
        '/api/v1/auth/login',
        '/api/v1/users/me',
        '/api/v1/users/{id}',
        '/api/health/ready',
      ]),
    );
  });

  it('marks public routes as needing no token and keeps the rest protected', async () => {
    const { paths } = (await t.http().get('/docs/openapi.json').expect(200)).body;

    for (const [path, method] of [
      ['/api/v1/auth/login', 'post'],
      ['/api/v1/auth/register', 'post'],
      ['/api/v1/auth/refresh', 'post'],
      ['/api/health/live', 'get'],
    ] as const) {
      expect(paths[path][method].security, path).toEqual([]);
      expect(paths[path][method]['x-public'], path).toBeUndefined();
    }
    // No operation-level override → inherits the global bearer requirement.
    expect(paths['/api/v1/users/me'].get.security).toBeUndefined();
    expect(paths['/api/v1/auth/logout'].post.security).toBeUndefined();
  });

  it('documents every operation with an id, a summary and its error responses', async () => {
    const { paths } = (await t.http().get('/docs/openapi.json').expect(200)).body;
    const ids = new Set<string>();

    for (const [path, item] of Object.entries<Record<string, any>>(paths)) {
      for (const [method, op] of Object.entries(item)) {
        const where = `${method.toUpperCase()} ${path}`;
        expect(op.summary, where).toBeTruthy();
        expect(op.tags?.length, where).toBeGreaterThan(0);
        expect(ids.has(op.operationId), `duplicate operationId at ${where}`).toBe(false);
        ids.add(op.operationId);
      }
    }

    const getUser = paths['/api/v1/users/{id}'].get;
    expect(Object.keys(getUser.responses)).toEqual(
      expect.arrayContaining(['200', '400', '401', '403', '404', '429', '500']),
    );
    expect(getUser.responses['404'].content['application/problem+json'].schema.$ref).toContain(
      'ProblemDetails',
    );
    // A public route does not claim it can fail for a missing access token…
    expect(paths['/api/v1/auth/register'].post.responses['401']).toBeUndefined();
    // …but login keeps its own 401 (wrong credentials).
    expect(paths['/api/v1/auth/login'].post.responses['401'].description).toContain(
      'INVALID_CREDENTIALS',
    );
  });
});
