/**
 * Domain events published by the users feature.
 *
 * Other features subscribe with `@OnEvent(UserRegisteredEvent.NAME)` instead of
 * being called directly, which keeps features decoupled.
 * Event names: `<feature>.<past-tense-verb>`.
 */
export class UserRegisteredEvent {
  static readonly NAME = 'users.registered';

  constructor(
    readonly userId: string,
    readonly email: string,
    readonly displayName: string,
  ) {}
}

export class UserDeletedEvent {
  static readonly NAME = 'users.deleted';

  constructor(readonly userId: string) {}
}

/**
 * Published inside the password-change transaction and awaited, so subscribers
 * (auth revokes the user's sessions) succeed or fail together with the change.
 */
export class UserPasswordChangedEvent {
  static readonly NAME = 'users.password_changed';

  constructor(readonly userId: string) {}
}
