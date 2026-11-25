import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { UserPasswordChangedEvent } from '../../users/index.js';
import { SessionRepository } from '../domain/session.repository.js';

/**
 * Signs a user out everywhere when their password changes: whoever knew the old
 * password (or holds a refresh token obtained with it) loses access.
 *
 * The users feature publishes the event with `emitAsync` inside its transaction and
 * awaits it. `suppressErrors: false` lets a failure here roll the password change back
 * instead of leaving old sessions alive.
 */
@Injectable()
export class SessionRevocationListener {
  private readonly logger = new Logger(SessionRevocationListener.name);

  constructor(private readonly sessions: SessionRepository) {}

  @OnEvent(UserPasswordChangedEvent.NAME, { suppressErrors: false })
  async onPasswordChanged(event: UserPasswordChangedEvent): Promise<void> {
    const revoked = await this.sessions.revokeAllForUser(event.userId);
    this.logger.log({ userId: event.userId, revoked }, 'Password changed, sessions revoked');
  }
}
