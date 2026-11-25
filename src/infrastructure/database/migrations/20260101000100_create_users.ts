import { sql, type Kysely } from 'kysely';

/**
 * Migrations are written with snake_case identifiers (no CamelCasePlugin) and
 * typed as `Kysely<any>`: they describe the schema at a point in time and must
 * never import application types, which keep evolving.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('users')
    .addColumn('id', 'uuid', (col) => col.primaryKey())
    .addColumn('email', 'varchar(320)', (col) => col.notNull())
    .addColumn('password_hash', 'text', (col) => col.notNull())
    .addColumn('display_name', 'varchar(100)', (col) => col.notNull())
    .addColumn('role', 'varchar(20)', (col) => col.notNull().defaultTo('user'))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addCheckConstraint('users_role_check', sql`role in ('user', 'admin')`)
    .execute();

  // Emails are stored lower-cased by the domain; the unique index enforces it at DB level too.
  await db.schema.createIndex('users_email_key').on('users').column('email').unique().execute();
  await db.schema.createIndex('users_created_at_idx').on('users').column('created_at').execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('users').execute();
}
