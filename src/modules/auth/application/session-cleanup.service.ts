import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { AppConfig } from '../../../config/index.js';
import { SessionRepository } from '../domain/session.repository.js';

const INTERVAL_MS = 60 * 60 * 1000;

/**
 * Deletes expired sessions once an hour so `auth_sessions` does not grow forever.
 *
 * The delete is idempotent, so running it on every replica is harmless. For jobs that
 * must run on exactly one instance, use a real scheduler (docs/14-recipes.md).
 */
@Injectable()
export class SessionCleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SessionCleanupService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly sessions: SessionRepository,
    private readonly config: AppConfig,
  ) {}

  onModuleInit(): void {
    if (this.config.isTest) return;
    this.timer = setInterval(() => void this.run(), INTERVAL_MS);
    this.timer.unref(); // never keeps the process alive during shutdown
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }

  async run(now: Date = new Date()): Promise<number> {
    try {
      const deleted = await this.sessions.deleteExpired(now);
      if (deleted > 0) this.logger.log({ deleted }, 'Expired sessions deleted');
      return deleted;
    } catch (err) {
      this.logger.error({ err }, 'Session cleanup failed');
      return 0;
    }
  }
}
