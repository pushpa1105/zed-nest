import { existsSync } from 'node:fs';
import { parseEnv, type Env } from './env.schema.js';

export type NodeEnv = Env['NODE_ENV'];
export type LogLevel = Env['LOG_LEVEL'];
export type DatabaseClient = Env['DB_CLIENT'];

export interface HttpConfig {
  readonly port: number;
  readonly apiPrefix: string;
  readonly corsOrigins: readonly string[];
  /** Serve the Scalar API reference and the OpenAPI document under `/docs`. */
  readonly docsEnabled: boolean;
  readonly requestTimeoutMs: number;
  readonly bodyLimit: string;
  /** Number of trusted reverse-proxy hops in front of the app (0 = none). */
  readonly trustProxyHops: number;
  readonly keepAliveTimeoutMs: number;
}

export interface LogConfig {
  readonly level: LogLevel;
  readonly pretty: boolean;
}

export interface DatabaseConfig {
  readonly client: DatabaseClient;
  readonly url: string;
  readonly poolMax: number;
  readonly ssl: boolean;
  readonly statementTimeoutMs: number;
  /** How long a query waits for a free pooled connection before failing (0 = forever). */
  readonly connectionTimeoutMs: number;
  /** Idle pooled connections are closed after this long (0 = never). */
  readonly idleTimeoutMs: number;
  /** The server ends sessions that sit idle inside an open transaction this long (0 = never). */
  readonly idleInTransactionTimeoutMs: number;
  readonly logQueries: boolean;
}

export interface AuthConfig {
  readonly accessSecret: string;
  readonly accessTtlSeconds: number;
  readonly refreshSecret: string;
  readonly refreshTtlSeconds: number;
  readonly issuer: string;
  readonly audience: string;
}

export interface ThrottleConfig {
  readonly ttlMs: number;
  readonly limit: number;
}

export interface SeedConfig {
  readonly adminEmail?: string;
  readonly adminPassword?: string;
}

/**
 * Strongly-typed, immutable application configuration.
 *
 * Registered as a global provider (see `ConfigModule`), so any class can simply
 * inject it:  `constructor(private readonly config: AppConfig) {}`
 *
 * Grouped by concern so each component only depends on its own section.
 */
export class AppConfig {
  readonly env: NodeEnv;
  readonly http: HttpConfig;
  readonly log: LogConfig;
  readonly database: DatabaseConfig;
  readonly auth: AuthConfig;
  readonly throttle: ThrottleConfig;
  readonly seed: SeedConfig;

  constructor(env: Env) {
    this.env = env.NODE_ENV;
    this.http = Object.freeze({
      port: env.PORT,
      apiPrefix: env.API_PREFIX,
      corsOrigins: Object.freeze([...env.CORS_ORIGINS]),
      docsEnabled: env.API_DOCS_ENABLED ?? env.NODE_ENV !== 'production',
      requestTimeoutMs: env.REQUEST_TIMEOUT_MS,
      bodyLimit: env.BODY_LIMIT,
      trustProxyHops: env.TRUST_PROXY,
      keepAliveTimeoutMs: env.HTTP_KEEP_ALIVE_TIMEOUT_MS,
    });
    this.log = Object.freeze({ level: env.LOG_LEVEL, pretty: env.LOG_PRETTY });
    this.database = Object.freeze({
      client: env.DB_CLIENT,
      url: env.DATABASE_URL,
      poolMax: env.DB_POOL_MAX,
      ssl: env.DB_SSL,
      statementTimeoutMs: env.DB_STATEMENT_TIMEOUT_MS,
      connectionTimeoutMs: env.DB_CONNECTION_TIMEOUT_MS,
      idleTimeoutMs: env.DB_IDLE_TIMEOUT_MS,
      idleInTransactionTimeoutMs: env.DB_IDLE_IN_TX_TIMEOUT_MS,
      logQueries: env.DB_LOG_QUERIES,
    });
    this.auth = Object.freeze({
      accessSecret: env.JWT_ACCESS_SECRET,
      accessTtlSeconds: env.JWT_ACCESS_TTL,
      refreshSecret: env.JWT_REFRESH_SECRET,
      refreshTtlSeconds: env.JWT_REFRESH_TTL,
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
    });
    this.throttle = Object.freeze({ ttlMs: env.THROTTLE_TTL_MS, limit: env.THROTTLE_LIMIT });
    this.seed = Object.freeze({
      adminEmail: env.SEED_ADMIN_EMAIL,
      adminPassword: env.SEED_ADMIN_PASSWORD,
    });
    Object.freeze(this);
  }

  get isProduction(): boolean {
    return this.env === 'production';
  }

  get isTest(): boolean {
    return this.env === 'test';
  }
}

/**
 * Loads `.env` (if present; real environment variables always win) and returns
 * a validated `AppConfig`. Used by `ConfigModule` and by standalone CLIs.
 */
export function loadConfig(options: { envFile?: string | false } = {}): AppConfig {
  const envFile = options.envFile ?? '.env';
  if (envFile && existsSync(envFile)) {
    process.loadEnvFile(envFile);
  }
  return new AppConfig(parseEnv(process.env));
}
