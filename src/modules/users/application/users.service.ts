import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Transactional } from '@nestjs-cls/transactional';
import type { Page } from '../../../shared/pagination/index.js';
import { PasswordHasher } from '../../../shared/security/password-hasher.js';
import type { Role } from '../../../shared/security/role.js';
import { User } from '../domain/user.js';
import {
  CannotModifySelfError,
  InvalidCurrentPasswordError,
  UserEmailTakenError,
  UserNotFoundError,
} from '../domain/user.errors.js';
import {
  UserDeletedEvent,
  UserPasswordChangedEvent,
  UserRegisteredEvent,
} from '../domain/user.events.js';
import { UserRepository, type UserListQuery } from '../domain/user.repository.js';

export interface RegisterUserInput {
  email: string;
  password: string;
  displayName: string;
  role?: Role;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

/**
 * Application service (use cases) for users.
 *
 * Orchestrates domain objects + ports. It knows nothing about HTTP (no
 * HttpException, no Request) or SQL (no Kysely) — it is equally usable from a
 * controller, a queue consumer, a CLI or another feature.
 */
@Injectable()
export class UsersService {
  /** Used to equalise timing when the email does not exist (prevents user enumeration). */
  private dummyHash?: Promise<string>;

  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
    private readonly events: EventEmitter2,
  ) {}

  async register(input: RegisterUserInput): Promise<User> {
    const email = User.normalizeEmail(input.email);
    if (await this.users.existsByEmail(email)) {
      throw new UserEmailTakenError(email);
    }

    const user = User.create({
      email,
      passwordHash: await this.hasher.hash(input.password),
      displayName: input.displayName,
      role: input.role,
    });
    await this.users.insert(user);

    this.events.emit(
      UserRegisteredEvent.NAME,
      new UserRegisteredEvent(user.id, user.email, user.displayName),
    );
    return user;
  }

  /** Returns the user when the credentials are valid, otherwise `null`. */
  async verifyCredentials(email: string, password: string): Promise<User | null> {
    const user = await this.users.findByEmail(User.normalizeEmail(email));
    if (!user) {
      this.dummyHash ??= this.hasher.hash('timing-equaliser');
      await this.hasher.verify(await this.dummyHash, password);
      return null;
    }
    return (await this.hasher.verify(user.passwordHash, password)) ? user : null;
  }

  async getById(id: string): Promise<User> {
    const user = await this.users.findById(id);
    if (!user) throw new UserNotFoundError(id);
    return user;
  }

  list(query: UserListQuery): Promise<Page<User>> {
    return this.users.list(query);
  }

  async updateProfile(id: string, changes: { displayName?: string }): Promise<User> {
    const user = await this.getById(id);
    if (changes.displayName !== undefined) user.rename(changes.displayName);
    await this.users.update(user);
    return user;
  }

  /**
   * Changes the password and signs the user out everywhere (the auth feature revokes
   * the sessions when it receives the event). One transaction: either both happen or neither.
   */
  @Transactional()
  async changePassword(id: string, input: ChangePasswordInput): Promise<void> {
    const user = await this.getById(id);
    if (!(await this.hasher.verify(user.passwordHash, input.currentPassword))) {
      throw new InvalidCurrentPasswordError();
    }
    user.changePasswordHash(await this.hasher.hash(input.newPassword));
    await this.users.update(user);
    await this.events.emitAsync(
      UserPasswordChangedEvent.NAME,
      new UserPasswordChangedEvent(user.id),
    );
  }

  async changeRole(actorId: string, targetId: string, role: Role): Promise<User> {
    if (actorId === targetId) throw new CannotModifySelfError('change the role of');
    const user = await this.getById(targetId);
    user.changeRole(role);
    await this.users.update(user);
    return user;
  }

  async delete(actorId: string, targetId: string): Promise<void> {
    if (actorId === targetId) throw new CannotModifySelfError('delete');
    if (!(await this.users.delete(targetId))) throw new UserNotFoundError(targetId);
    this.events.emit(UserDeletedEvent.NAME, new UserDeletedEvent(targetId));
  }
}
