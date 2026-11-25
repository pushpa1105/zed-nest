import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { sql, type Kysely } from 'kysely';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/app.setup.js';
import { AppConfig, parseEnv } from '../../src/config/index.js';
import { DATABASE } from '../../src/infrastructure/database/database.constants.js';
import type { Database } from '../../src/infrastructure/database/database.schema.js';

export interface TestApp {
  app: NestExpressApplication;
  db: Kysely<Database>;
  http: () => ReturnType<typeof request>;
  /** Empties all application tables (keeps the migration bookkeeping). */
  reset: () => Promise<void>;
  close: () => Promise<void>;
}

/**
 * Boots the real AppModule with the exact production HTTP pipeline.
 * Pass env overrides to test a specific configuration, e.g. `{ API_DOCS_ENABLED: 'true' }`.
 *
 * Keep ONE app alive at a time: nestjs-cls holds process-wide state, so closing a second
 * instance breaks the first. Use a separate `describe` (or file) per configuration.
 */
export async function createTestApp(env: Record<string, string> = {}): Promise<TestApp> {
  const builder = Test.createTestingModule({ imports: [AppModule] });
  if (Object.keys(env).length > 0) {
    builder
      .overrideProvider(AppConfig)
      .useValue(new AppConfig(parseEnv({ ...process.env, ...env })));
  }
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({
    bodyParser: false,
    logger: false,
  });
  configureApp(app, app.get(AppConfig));
  await app.init();

  const db = app.get<Kysely<Database>>(DATABASE);

  return {
    app,
    db,
    http: () => request(app.getHttpServer() as App),
    reset: async () => {
      await sql`truncate table users, auth_sessions restart identity cascade`.execute(db);
    },
    close: () => app.close(),
  };
}

export const API = '/api/v1';

export async function registerUser(
  t: TestApp,
  overrides: Partial<{ email: string; password: string; displayName: string }> = {},
) {
  const body = {
    email: `user-${Math.random().toString(36).slice(2)}@example.com`,
    password: 'Secret123',
    displayName: 'Test User',
    ...overrides,
  };
  const res = await t.http().post(`${API}/auth/register`).send(body).expect(201);
  return {
    ...body,
    id: res.body.user.id as string,
    tokens: res.body.tokens as { accessToken: string; refreshToken: string },
  };
}

/** Registers a user and promotes them to admin directly in the DB. */
export async function createAdmin(t: TestApp) {
  const user = await registerUser(t);
  await t.db
    .updateTable('users')
    .set({ role: 'admin', updatedAt: new Date() })
    .where('id', '=', user.id)
    .execute();
  const login = await t
    .http()
    .post(`${API}/auth/login`)
    .send({ email: user.email, password: user.password })
    .expect(200);
  return { ...user, tokens: login.body.tokens as { accessToken: string; refreshToken: string } };
}
