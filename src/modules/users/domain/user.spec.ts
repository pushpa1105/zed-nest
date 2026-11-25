import { User } from './user.js';

describe('User entity', () => {
  const now = new Date('2026-01-01T00:00:00Z');
  const later = new Date('2026-01-02T00:00:00Z');

  it('creates a user with normalised fields and defaults', () => {
    const user = User.create({ email: ' A@B.COM ', passwordHash: 'h', displayName: ' Ann ' }, now);

    expect(user.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(user.email).toBe('a@b.com');
    expect(user.displayName).toBe('Ann');
    expect(user.role).toBe('user');
    expect(user.createdAt).toEqual(now);
    expect(user.updatedAt).toEqual(now);
  });

  it('bumps updatedAt on every state change', () => {
    const user = User.create({ email: 'a@b.com', passwordHash: 'h', displayName: 'Ann' }, now);
    user.rename('Annie', later);

    expect(user.displayName).toBe('Annie');
    expect(user.updatedAt).toEqual(later);
    expect(user.createdAt).toEqual(now);
  });

  it('toSnapshot returns a copy that cannot mutate the entity', () => {
    const user = User.create({ email: 'a@b.com', passwordHash: 'h', displayName: 'Ann' }, now);
    const snapshot = user.toSnapshot() as { displayName: string };
    snapshot.displayName = 'Hacked';
    expect(user.displayName).toBe('Ann');
  });
});
