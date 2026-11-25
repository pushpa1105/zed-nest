import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppConfig } from '../config/index.js';
import { AllExceptionsFilter } from './http/all-exceptions.filter.js';
import { TimeoutInterceptor } from './http/timeout.interceptor.js';
import { createValidationPipe } from './http/validation.pipe.js';

/**
 * Cross-cutting HTTP behaviour applied to every route:
 *
 *  - ThrottlerGuard        rate limiting (per IP; tune per-route with @Throttle / @SkipThrottle)
 *  - Validation pipe       Standard Schema (Zod) validation of body/query/params
 *  - TimeoutInterceptor    408 after REQUEST_TIMEOUT_MS
 *  - AllExceptionsFilter   uniform RFC 9457 problem+json errors
 *
 * Authentication (the global AuthGuard) lives in the auth feature, which owns tokens.
 *
 * Note: the default throttler storage is in-memory (per instance). For multiple
 * replicas, plug a Redis storage — see docs/14-recipes.md.
 */
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        throttlers: [{ name: 'default', ttl: config.throttle.ttlMs, limit: config.throttle.limit }],
        skipIf: () => config.isTest,
      }),
    }),
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_PIPE, useFactory: createValidationPipe },
    { provide: APP_INTERCEPTOR, useClass: TimeoutInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class CoreModule {}
