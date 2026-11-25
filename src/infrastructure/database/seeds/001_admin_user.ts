import type { SeedContext } from '../cli/seed.js';
import { generateId } from '../../../shared/utils/id.js';

/** Creates the initial administrator if it does not exist yet. Idempotent. */
export async function seed({ db, config, hasher, log }: SeedContext): Promise<void> {
  const { adminEmail, adminPassword } = config.seed;
  if (!adminEmail || !adminPassword) {
    log('SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not set — skipping admin user');
    return;
  }

  const email = adminEmail.toLowerCase();
  const existing = await db
    .selectFrom('users')
    .select('id')
    .where('email', '=', email)
    .executeTakeFirst();
  if (existing) {
    log(`admin ${email} already exists`);
    return;
  }

  const now = new Date();
  await db
    .insertInto('users')
    .values({
      id: generateId(),
      email,
      passwordHash: await hasher.hash(adminPassword),
      displayName: 'Administrator',
      role: 'admin',
      createdAt: now,
      updatedAt: now,
    })
    .execute();
  log(`created admin ${email}`);
}
