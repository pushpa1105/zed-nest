import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { UsersModule } from '../users/index.js';
import { AuthService } from './application/auth.service.js';
import { SessionCleanupService } from './application/session-cleanup.service.js';
import { SessionRevocationListener } from './application/session-revocation.listener.js';
import { TokenService } from './application/token.service.js';
import { SessionRepository } from './domain/session.repository.js';
import { KyselySessionRepository } from './infrastructure/kysely-session.repository.js';
import { AuthController } from './presentation/auth.controller.js';
import { AuthGuard } from './presentation/auth.guard.js';

@Module({
  // Secrets/TTLs are passed per call by TokenService (access ≠ refresh secret).
  imports: [UsersModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    SessionRevocationListener,
    SessionCleanupService,
    { provide: SessionRepository, useClass: KyselySessionRepository },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [AuthService],
})
export class AuthModule {}
