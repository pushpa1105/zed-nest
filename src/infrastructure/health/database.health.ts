import { Inject, Injectable } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';
import { sql, type Kysely } from 'kysely';
import { DATABASE } from '../database/database.constants.js';
import type { Database } from '../database/database.schema.js';

@Injectable()
export class DatabaseHealthIndicator {
  constructor(
    @Inject(DATABASE) private readonly db: Kysely<Database>,
    private readonly health: HealthIndicatorService,
  ) {}

  async check(key = 'database', timeoutMs = 3000) {
    const indicator = this.health.check(key);
    const started = performance.now();
    try {
      await Promise.race([
        sql`select 1`.execute(this.db),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs)),
      ]);
      return indicator.up({ latencyMs: Math.round(performance.now() - started) });
    } catch (error) {
      return indicator.down({ message: (error as Error).message });
    }
  }
}
