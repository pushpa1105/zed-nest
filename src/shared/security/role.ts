/**
 * Roles known to the system. Kept as a string union (not a TS enum) so it maps
 * 1:1 to the DB column and to JSON without conversion.
 *
 * Need finer-grained control? Add permissions — see docs/09-authentication-and-authorization.md.
 */
export const ROLES = ['user', 'admin'] as const;
export type Role = (typeof ROLES)[number];

/** The identity attached to an authenticated request. */
export interface AuthenticatedUser {
  readonly id: string;
  readonly role: Role;
  /** Session id (refresh-token family) the access token was issued for. */
  readonly sessionId: string;
}
