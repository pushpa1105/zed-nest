import { PasswordHasher } from '../../../shared/security/password-hasher.js';

/** Fast, deterministic hasher for unit tests (argon2 is intentionally slow). */
export class FakePasswordHasher extends PasswordHasher {
  async hash(plain: string): Promise<string> {
    return `hashed:${plain}`;
  }

  async verify(hash: string, plain: string): Promise<boolean> {
    return hash === `hashed:${plain}`;
  }
}
