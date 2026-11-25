/**
 * Port for password hashing.
 *
 * Abstract class (not interface) so it doubles as the Nest DI token:
 *   constructor(private readonly hasher: PasswordHasher) {}
 *
 * Implementation: infrastructure/security/argon2-password-hasher.ts.
 * Swap algorithms by binding another implementation in SecurityModule.
 */
export abstract class PasswordHasher {
  abstract hash(plain: string): Promise<string>;
  abstract verify(hash: string, plain: string): Promise<boolean>;
}
