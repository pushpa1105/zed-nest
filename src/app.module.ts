import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ClsPluginTransactional } from '@nestjs-cls/transactional';
import { TransactionalAdapterKysely } from '@nestjs-cls/transactional-adapter-kysely';
import type { Request } from 'express';
import { ClsModule } from 'nestjs-cls';
import { ConfigModule } from './config/index.js';
import { CoreModule } from './core/core.module.js';
import type { RequestWithId } from './core/http/request-id.middleware.js';
import { DATABASE } from './infrastructure/database/database.constants.js';
import { DatabaseModule } from './infrastructure/database/database.module.js';
import { HealthModule } from './infrastructure/health/health.module.js';
import { LoggerModule } from './infrastructure/logger/logger.module.js';
import { SecurityModule } from './infrastructure/security/security.module.js';
import { FEATURE_MODULES } from './modules/index.js';

/**
 * Root module = composition root. It wires platform modules once; business
 * features are listed in modules/index.ts.
 *
 *  ┌ platform ──────────────────────────────────────────────────────────────┐
 *  │ Config · Logger · CLS(+transactions) · Events · Database · Security    │
 *  │ Core (guards/pipes/filters) · Health                                   │
 *  └────────────────────────────────────────────────────────────────────────┘
 *  ┌ features ──────────────────────────────────────────────────────────────┐
 *  │ Users · Auth · ...                                                     │
 *  └────────────────────────────────────────────────────────────────────────┘
 */
@Module({
  imports: [
    ConfigModule,
    LoggerModule,
    ClsModule.forRoot({
      global: true,
      middleware: {
        mount: true,
        generateId: true,
        idGenerator: (req: Request) => (req as RequestWithId).id,
      },
      plugins: [
        // Swapping the data-access library? Replace this adapter (Prisma, Drizzle,
        // TypeORM, Knex, pg-promise adapters exist) — `@Transactional()` call
        // sites in services stay untouched.
        new ClsPluginTransactional({
          imports: [DatabaseModule],
          adapter: new TransactionalAdapterKysely({ kyselyInstanceToken: DATABASE }),
        }),
      ],
    }),
    EventEmitterModule.forRoot({ wildcard: false, ignoreErrors: false }),
    DatabaseModule,
    SecurityModule,
    CoreModule,
    HealthModule,
    ...FEATURE_MODULES,
  ],
})
export class AppModule {}
