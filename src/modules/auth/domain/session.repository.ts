import type { Session } from './session.js';

export type NewSession = Omit<Session, 'revokedAt' | 'createdAt'>;

/** Persistence port for login sessions. */
export abstract class SessionRepository {
  abstract create(session: NewSession): Promise<void>;
  abstract findById(id: string): Promise<Session | null>;

  /**
   * Atomically replaces the refresh-token hash — only if the current hash still
   * equals `expectedHash` and the session is not revoked (compare-and-swap).
   * Returns false when another request already rotated it (replay/race).
   */
  abstract rotate(
    id: string,
    expectedHash: string,
    nextHash: string,
    expiresAt: Date,
  ): Promise<boolean>;

  abstract revoke(id: string): Promise<void>;
  abstract revokeAllForUser(userId: string): Promise<number>;
  /** Housekeeping: hard-deletes sessions expired before `before`. */
  abstract deleteExpired(before: Date): Promise<number>;
}
