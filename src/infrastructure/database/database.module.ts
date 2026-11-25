import { Global, Inject, Logger, Module, type OnApplicationShutdown } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { AppConfig } from '../../config/index.js';
import { DATABASE } from './database.constants.js';
import type { Database } from './database.schema.js';
import { createDatabase } from './kysely.factory.js';

/**
 * Owns the database connection pool lifecycle.
 *
 * Transactions are wired in app.module.ts via `ClsPluginTransactional` +
 * `TransactionalAdapterKysely`, which reuses the `DATABASE` token exported here.
 */
@Global()
@Module({
  providers: [
    {
      provide: DATABASE,
      inject: [AppConfig],
      useFactory: (config: AppConfig) => createDatabase(config.database),
    },
  ],
  exports: [DATABASE],
})
export class DatabaseModule implements OnApplicationShutdown {
  private readonly logger = new Logger(DatabaseModule.name);

  constructor(@Inject(DATABASE) private readonly db: Kysely<Database>) {}

  async onApplicationShutdown(): Promise<void> {
    await this.db.destroy();
    this.logger.log('Database pool closed');
  }
}
