import type { Role } from '../../../shared/security/role.js';
import { generateId } from '../../../shared/utils/id.js';

export interface UserProps {
  readonly id: string;
  email: string;
  passwordHash: string;
  displayName: string;
  role: Role;
  readonly createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserProps {
  email: string;
  passwordHash: string;
  displayName: string;
  role?: Role;
}

/**
 * User aggregate (domain entity).
 *
 * - Pure TypeScript: no Nest, no Kysely, no HTTP. Trivial to unit-test.
 * - State changes go through intention-revealing methods that enforce invariants
 *   (normalised email, trimmed names, `updatedAt` bumps) instead of free setters.
 * - `create()` makes a brand-new user; `restore()` rehydrates one from storage
 *   (used by repository mappers only — it performs no business validation).
 */
export class User {
  private constructor(private readonly props: UserProps) {}

  static create(input: CreateUserProps, now: Date = new Date()): User {
    return new User({
      id: generateId(),
      email: User.normalizeEmail(input.email),
      passwordHash: input.passwordHash,
      displayName: input.displayName.trim(),
      role: input.role ?? 'user',
      createdAt: now,
      updatedAt: now,
    });
  }

  static restore(props: UserProps): User {
    return new User({ ...props });
  }

  static normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  get id(): string {
    return this.props.id;
  }
  get email(): string {
    return this.props.email;
  }
  get passwordHash(): string {
    return this.props.passwordHash;
  }
  get displayName(): string {
    return this.props.displayName;
  }
  get role(): Role {
    return this.props.role;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  isAdmin(): boolean {
    return this.props.role === 'admin';
  }

  rename(displayName: string, now: Date = new Date()): void {
    this.props.displayName = displayName.trim();
    this.touch(now);
  }

  changeRole(role: Role, now: Date = new Date()): void {
    this.props.role = role;
    this.touch(now);
  }

  changePasswordHash(passwordHash: string, now: Date = new Date()): void {
    this.props.passwordHash = passwordHash;
    this.touch(now);
  }

  /** Read-only copy of the internal state (for mappers/presenters). */
  toSnapshot(): Readonly<UserProps> {
    return { ...this.props };
  }

  private touch(now: Date): void {
    this.props.updatedAt = now;
  }
}
