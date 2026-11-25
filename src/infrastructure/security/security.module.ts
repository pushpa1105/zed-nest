import { Global, Module } from '@nestjs/common';
import { PasswordHasher } from '../../shared/security/password-hasher.js';
import { Argon2PasswordHasher } from './argon2-password-hasher.js';

/** Binds security ports to their implementations. */
@Global()
@Module({
  providers: [{ provide: PasswordHasher, useClass: Argon2PasswordHasher }],
  exports: [PasswordHasher],
})
export class SecurityModule {}
