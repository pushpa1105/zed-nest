import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('auth_sessions')
    .addColumn('id', 'uuid', (col) => col.primaryKey())
    .addColumn('user_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('refresh_token_hash', 'varchar(128)', (col) => col.notNull())
    .addColumn('user_agent', 'varchar(512)')
    .addColumn('ip_address', 'varchar(64)')
    .addColumn('expires_at', 'timestamptz', (col) => col.notNull())
    .addColumn('revoked_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createIndex('auth_sessions_user_id_idx')
    .on('auth_sessions')
    .column('user_id')
    .execute();
  await db.schema
    .createIndex('auth_sessions_expires_at_idx')
    .on('auth_sessions')
    .column('expires_at')
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('auth_sessions').execute();
}
