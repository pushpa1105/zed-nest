import { AppConfig } from './app-config.js';
import { parseEnv } from './env.schema.js';

const base = {
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
};

describe('env schema', () => {
  it('applies defaults and coerces types', () => {
    const env = parseEnv({
      ...base,
      PORT: '8080',
      LOG_PRETTY: 'true',
      CORS_ORIGINS: 'a.com, b.com',
    });
    expect(env.PORT).toBe(8080);
    expect(env.LOG_PRETTY).toBe(true);
    expect(env.CORS_ORIGINS).toEqual(['a.com', 'b.com']);
    expect(env.NODE_ENV).toBe('development');
  });

  it('lists every invalid variable in one error', () => {
    expect(() => parseEnv({ PORT: 'abc' })).toThrow(
      /PORT[\s\S]*DATABASE_URL[\s\S]*JWT_ACCESS_SECRET/,
    );
  });

  it('refuses identical access and refresh secrets', () => {
    expect(() => parseEnv({ ...base, JWT_REFRESH_SECRET: base.JWT_ACCESS_SECRET })).toThrow(
      /must differ/,
    );
  });

  it('refuses default secrets in production', () => {
    const secret = `change-me-${'x'.repeat(30)}`;
    expect(() => parseEnv({ ...base, NODE_ENV: 'production', JWT_ACCESS_SECRET: secret })).toThrow(
      /default secret/,
    );
  });

  const prod = { ...base, NODE_ENV: 'production', CORS_ORIGINS: 'https://app.example.com' };

  it('disables the API docs in production unless explicitly enabled', () => {
    expect(new AppConfig(parseEnv(prod)).http.docsEnabled).toBe(false);
    expect(new AppConfig(parseEnv({ ...prod, API_DOCS_ENABLED: 'true' })).http.docsEnabled).toBe(
      true,
    );
  });

  it('rejects a wildcard CORS origin in production', () => {
    expect(() => parseEnv({ ...base, NODE_ENV: 'production' })).toThrow(/CORS_ORIGINS/);
    expect(() => parseEnv({ ...prod, CORS_ORIGINS: 'https://a.com,*' })).toThrow(/CORS_ORIGINS/);
    expect(parseEnv(base).CORS_ORIGINS).toEqual(['*']); // fine outside production
  });

  it('reads TRUST_PROXY as a hop count', () => {
    expect(parseEnv(base).TRUST_PROXY).toBe(0);
    expect(parseEnv({ ...base, TRUST_PROXY: 'true' }).TRUST_PROXY).toBe(1);
    expect(parseEnv({ ...base, TRUST_PROXY: 'false' }).TRUST_PROXY).toBe(0);
    expect(parseEnv({ ...base, TRUST_PROXY: '2' }).TRUST_PROXY).toBe(2);
    expect(() => parseEnv({ ...base, TRUST_PROXY: 'maybe' })).toThrow(/TRUST_PROXY/);
  });
});
