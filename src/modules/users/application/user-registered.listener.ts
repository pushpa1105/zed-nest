import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { UserRegisteredEvent } from '../domain/user.events.js';

/**
 * Example event subscriber. Replace the log line with real work (welcome email,
 * analytics, provisioning...). `async: true` runs it off the request path.
 *
 * In-process events are fire-and-forget and lost on crash. When a side effect
 * MUST happen, use the transactional outbox pattern — see docs/14-recipes.md.
 */
@Injectable()
export class UserRegisteredListener {
  private readonly logger = new Logger(UserRegisteredListener.name);

  @OnEvent(UserRegisteredEvent.NAME, { async: true })
  handle(event: UserRegisteredEvent): void {
    this.logger.log({ userId: event.userId }, 'User registered — send welcome email here');
  }
}
