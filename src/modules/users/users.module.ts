import { Module } from '@nestjs/common';
import { UserRegisteredListener } from './application/user-registered.listener.js';
import { UsersService } from './application/users.service.js';
import { UserRepository } from './domain/user.repository.js';
import { KyselyUserRepository } from './infrastructure/kysely-user.repository.js';
import { UsersController } from './presentation/users.controller.js';

/**
 * Composition root of the users feature — the ONLY file that knows which
 * adapter implements each port. Swap persistence by changing `useClass`.
 */
@Module({
  controllers: [UsersController],
  providers: [
    UsersService,
    UserRegisteredListener,
    { provide: UserRepository, useClass: KyselyUserRepository },
  ],
  exports: [UsersService],
})
export class UsersModule {}
