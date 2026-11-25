/**
 * A login session = one refresh-token family (one device/browser).
 *
 * The refresh token itself is never stored — only its SHA-256 hash. Each
 * refresh rotates the token; presenting an old (already rotated) token means
 * it was stolen or replayed, so every session of that user is revoked.
 */
export interface Session {
  readonly id: string;
  readonly userId: string;
  readonly refreshTokenHash: string;
  readonly userAgent: string | null;
  readonly ipAddress: string | null;
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
  readonly createdAt: Date;
}

export function isSessionActive(session: Session, now: Date = new Date()): boolean {
  return session.revokedAt === null && session.expiresAt.getTime() > now.getTime();
}
