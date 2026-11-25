import { z } from 'zod';

/**
 * Single source of truth for every environment variable the app reads.
 *
 * - Values are coerced (strings → numbers/booleans) and defaulted here.
 * - Nothing else in the codebase may read `process.env` directly; inject
 *   `AppConfig` instead (or call `loadConfig()` in standalone scripts).
 * - Adding a variable? Add it here, map it in `app-config.ts`, document it in
 *   `.env.example` and docs/06-configuration.md.
 */

const bool = z
  .enum(['true', 'false', '1', '0', 'yes', 'no'])
  .transform((v) => v === 'true' || v === '1' || v === 'yes');

/**
 * `false` / `true` / hop count → number of trusted reverse-proxy hops (0 = none).
 * `true` means one hop: a single load balancer or ingress in front of the app.
 */
const proxyHops = z
  .string()
  .regex(/^(true|false|\d{1,2})$/, 'must be true, false or a hop count')
  .transform((v) => (v === 'true' ? 1 : v === 'false' ? 0 : Number(v)));

const csv = z.string().transform((v) =>
  v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    API_PREFIX: z.string().default('api'),
    CORS_ORIGINS: csv.default(['*']),
    API_DOCS_ENABLED: bool.optional(),
    REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
    BODY_LIMIT: z.string().default('1mb'),
    TRUST_PROXY: proxyHops.default(0),
    HTTP_KEEP_ALIVE_TIMEOUT_MS: z.coerce.number().int().positive().default(65_000),

    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    LOG_PRETTY: bool.default(false),

    DB_CLIENT: z.enum(['postgres']).default('postgres'),
    DATABASE_URL: z.url(),
    DB_POOL_MAX: z.coerce.number().int().positive().default(10),
    DB_SSL: bool.default(false),
    DB_STATEMENT_TIMEOUT_MS: z.coerce.number().int().nonnegative().default(10_000),
    DB_CONNECTION_TIMEOUT_MS: z.coerce.number().int().nonnegative().default(5_000),
    DB_IDLE_TIMEOUT_MS: z.coerce.number().int().nonnegative().default(30_000),
    DB_IDLE_IN_TX_TIMEOUT_MS: z.coerce.number().int().nonnegative().default(30_000),
    DB_LOG_QUERIES: bool.default(false),

    JWT_ACCESS_SECRET: z.string().min(32, 'must be at least 32 characters'),
    JWT_ACCESS_TTL: z.coerce.number().int().positive().default(900),
    JWT_REFRESH_SECRET: z.string().min(32, 'must be at least 32 characters'),
    JWT_REFRESH_TTL: z.coerce.number().int().positive().default(1_209_600),
    JWT_ISSUER: z.string().default('zed-nest'),
    JWT_AUDIENCE: z.string().default('zed-nest-clients'),

    THROTTLE_TTL_MS: z.coerce.number().int().positive().default(60_000),
    THROTTLE_LIMIT: z.coerce.number().int().positive().default(100),

    SEED_ADMIN_EMAIL: z.email().optional(),
    SEED_ADMIN_PASSWORD: z.string().min(8).optional(),
  })
  .superRefine((env, ctx) => {
    if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
      ctx.addIssue({
        code: 'custom',
        path: ['JWT_REFRESH_SECRET'],
        message: 'access and refresh secrets must differ',
      });
    }
    if (env.NODE_ENV === 'production') {
      if (env.CORS_ORIGINS.includes('*')) {
        ctx.addIssue({
          code: 'custom',
          path: ['CORS_ORIGINS'],
          message: 'wildcard origin is not allowed in production, list the allowed origins',
        });
      }
      for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'] as const) {
        if (env[key].startsWith('change-me')) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: 'default secret used in production',
          });
        }
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

/** Parses and validates an env record, throwing one readable error listing every problem. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  return result.data;
}
