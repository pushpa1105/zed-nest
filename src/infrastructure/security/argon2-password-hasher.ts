import { Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';
import { PasswordHasher } from '../../shared/security/password-hasher.js';

/**
 * Argon2id (OWASP-recommended) password hashing via a Rust binding — no
 * node-gyp toolchain needed. Parameters follow the OWASP Password Storage
 * Cheat Sheet minimums (m=19 MiB, t=2, p=1).
 */
@Injectable()
export class Argon2PasswordHasher extends PasswordHasher {
  private static readonly OPTIONS = {
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  } as const;

  hash(plain: string): Promise<string> {
    return hash(plain, Argon2PasswordHasher.OPTIONS);
  }

  async verify(hashed: string, plain: string): Promise<boolean> {
    try {
      return await verify(hashed, plain);
    } catch {
      return false; // malformed hash → treat as mismatch
    }
  }
}
