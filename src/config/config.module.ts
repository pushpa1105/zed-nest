import { Global, Module } from '@nestjs/common';
import { AppConfig, loadConfig } from './app-config.js';

/**
 * Exposes the validated `AppConfig` to the whole application.
 * In tests, override it with `.overrideProvider(AppConfig).useValue(...)`.
 */
@Global()
@Module({
  providers: [{ provide: AppConfig, useFactory: () => loadConfig() }],
  exports: [AppConfig],
})
export class ConfigModule {}
