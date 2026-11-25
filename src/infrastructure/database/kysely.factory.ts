import { Logger } from '@nestjs/common';
import {
  CamelCasePlugin,
  Kysely,
  PostgresDialect,
  type Dialect,
  type KyselyPlugin,
  type LogEvent,
} from 'kysely';
import pg from 'pg';
import type { DatabaseConfig } from '../../config/index.js';
import type { Database } from './database.schema.js';

/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  THE ONLY PLACE THAT KNOWS WHICH DATABASE ENGINE WE TALK TO.         ║
 * ║  Switching engine = add a `case` below + install its driver.         ║
 * ║  See docs/05-database.md → "Switching the database engine".          ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 */
export function createDialect(config: DatabaseConfig): Dialect {
  switch (config.client) {
    case 'postgres': {
      const pool = new pg.Pool({
        connectionString: config.url,
        max: config.poolMax,
        ssl: config.ssl ? { rejectUnauthorized: true } : undefined,
        // Fail fast instead of queueing forever when the pool is exhausted or the DB is down.
        connectionTimeoutMillis: config.connectionTimeoutMs,
        idleTimeoutMillis: config.idleTimeoutMs,
        statement_timeout: config.statementTimeoutMs || undefined,
        // A stuck request must not pin a connection (and its locks) in an open transaction.
        idle_in_transaction_session_timeout: config.idleInTransactionTimeoutMs || undefined,
        keepAlive: true,
        application_name: 'zed-nest',
      });
      // An idle client can fail at any time (DB restart, failover, network drop). Without a
      // listener, node-postgres emits an unhandled 'error' event and the process crashes.
      pool.on('error', (err) => {
        new Logger('Database').error({ err }, 'Idle database connection failed');
      });
      return new PostgresDialect({ pool });
    }

    // case 'mysql':
    //   return new MysqlDialect({ pool: createPool({ uri: config.url, connectionLimit: config.poolMax }) });
    // case 'sqlite':
    //   return new SqliteDialect({ database: new SQLite(config.url) });
    // case 'mssql':
    //   return new MssqlDialect({ tarn: {...}, tedious: {...} });

    default: {
      const exhaustive: never = config.client;
      throw new Error(`Unsupported DB_CLIENT: ${String(exhaustive)}`);
    }
  }
}

export interface CreateDatabaseOptions {
  /**
   * Map camelCase TS identifiers ↔ snake_case SQL identifiers. On for the app,
   * off for migrations (which are written in raw snake_case for clarity).
   */
  camelCase?: boolean;
}

export function createDatabase(
  config: DatabaseConfig,
  { camelCase = true }: CreateDatabaseOptions = {},
): Kysely<Database> {
  const logger = new Logger('Database');
  const plugins: KyselyPlugin[] = camelCase ? [new CamelCasePlugin()] : [];

  return new Kysely<Database>({
    dialect: createDialect(config),
    plugins,
    log: (event: LogEvent) => {
      if (event.level === 'error') {
        logger.error(
          { sql: event.query.sql, durationMs: event.queryDurationMillis, err: event.error },
          'Query failed',
        );
      } else if (config.logQueries) {
        logger.debug({ sql: event.query.sql, durationMs: event.queryDurationMillis }, 'Query');
      }
    },
  });
}
