import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { PasswordHasher } from '../../../shared/security/password-hasher.js';
import {
  CannotModifySelfError,
  InvalidCurrentPasswordError,
  UserEmailTakenError,
  UserNotFoundError,
} from '../domain/user.errors.js';
import { UserPasswordChangedEvent, UserRegisteredEvent } from '../domain/user.events.js';
import { UserRepository } from '../domain/user.repository.js';
import { FakePasswordHasher } from '../testing/fake-password-hasher.js';
import { InMemoryUserRepository } from '../testing/in-memory-user.repository.js';
import { UsersService } from './users.service.js';

// `@Transactional()` needs the CLS context, which unit tests do not have. Make it a no-op.
vi.mock(import('@nestjs-cls/transactional'), async (importOriginal) => ({
  ...(await importOriginal()),
  Transactional: (() => (_t: unknown, _k: string, descriptor: PropertyDescriptor) =>
    descriptor) as never,
}));

describe('UsersService', () => {
  let service: UsersService;
  let repo: InMemoryUserRepository;
  let events: { emit: ReturnType<typeof vi.fn>; emitAsync: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    repo = new InMemoryUserRepository();
    events = { emit: vi.fn(), emitAsync: vi.fn().mockResolvedValue([]) };

    // Uses the Nest DI container (also verifies decorator metadata works under Vitest).
    const moduleRef = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: UserRepository, useValue: repo },
        { provide: PasswordHasher, useClass: FakePasswordHasher },
        { provide: EventEmitter2, useValue: events },
      ],
    }).compile();

    service = moduleRef.get(UsersService);
  });

  const register = (email = 'Jane@Example.com') =>
    service.register({ email, password: 'Secret123', displayName: '  Jane  ' });

  describe('register', () => {
    it('normalises input, hashes the password and emits an event', async () => {
      const user = await register();

      expect(user.email).toBe('jane@example.com');
      expect(user.displayName).toBe('Jane');
      expect(user.role).toBe('user');
      expect(user.passwordHash).toBe('hashed:Secret123');
      expect(repo.rows.size).toBe(1);
      expect(events.emit).toHaveBeenCalledWith(
        UserRegisteredEvent.NAME,
        expect.any(UserRegisteredEvent),
      );
    });

    it('rejects duplicate emails case-insensitively', async () => {
      await register('jane@example.com');
      await expect(register('JANE@example.com')).rejects.toBeInstanceOf(UserEmailTakenError);
    });
  });

  describe('verifyCredentials', () => {
    it('returns the user for valid credentials', async () => {
      const user = await register();
      await expect(
        service.verifyCredentials('jane@example.com', 'Secret123'),
      ).resolves.toMatchObject({
        id: user.id,
      });
    });

    it('returns null for a wrong password or unknown email', async () => {
      await register();
      await expect(service.verifyCredentials('jane@example.com', 'nope')).resolves.toBeNull();
      await expect(service.verifyCredentials('ghost@example.com', 'Secret123')).resolves.toBeNull();
    });
  });

  describe('changePassword', () => {
    it('requires the current password', async () => {
      const user = await register();
      await expect(
        service.changePassword(user.id, { currentPassword: 'wrong', newPassword: 'NewSecret1' }),
      ).rejects.toBeInstanceOf(InvalidCurrentPasswordError);
    });

    it('persists the new hash', async () => {
      const user = await register();
      await service.changePassword(user.id, {
        currentPassword: 'Secret123',
        newPassword: 'NewSecret1',
      });
      expect((await repo.findById(user.id))?.passwordHash).toBe('hashed:NewSecret1');
    });

    it('publishes an awaited event so sessions get revoked', async () => {
      const user = await register();
      await service.changePassword(user.id, {
        currentPassword: 'Secret123',
        newPassword: 'NewSecret1',
      });
      expect(events.emitAsync).toHaveBeenCalledWith(
        UserPasswordChangedEvent.NAME,
        expect.objectContaining({ userId: user.id }),
      );
    });

    it('fails when a subscriber fails (the transaction then rolls back)', async () => {
      const user = await register();
      events.emitAsync.mockRejectedValueOnce(new Error('revocation failed'));
      await expect(
        service.changePassword(user.id, {
          currentPassword: 'Secret123',
          newPassword: 'NewSecret1',
        }),
      ).rejects.toThrow('revocation failed');
    });
  });

  describe('admin operations', () => {
    it('prevents admins from changing their own role or deleting themselves', async () => {
      const user = await register();
      await expect(service.changeRole(user.id, user.id, 'admin')).rejects.toBeInstanceOf(
        CannotModifySelfError,
      );
      await expect(service.delete(user.id, user.id)).rejects.toBeInstanceOf(CannotModifySelfError);
    });

    it('throws UserNotFoundError for unknown ids', async () => {
      await expect(service.getById('00000000-0000-7000-8000-000000000000')).rejects.toBeInstanceOf(
        UserNotFoundError,
      );
      await expect(service.delete('actor', 'missing')).rejects.toBeInstanceOf(UserNotFoundError);
    });
  });
});
