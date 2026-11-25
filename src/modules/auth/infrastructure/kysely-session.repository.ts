import { Injectable } from '@nestjs/common';
import { InjectDb, type DbTransactionHost } from '../../../infrastructure/database/transaction.js';
import type { Session } from '../domain/session.js';
import { SessionRepository, type NewSession } from '../domain/session.repository.js';
import type { AuthSessionRow } from './auth-sessions.table.js';

function toDomain(row: AuthSessionRow): Session {
  return {
    id: row.id,
    userId: row.userId,
    refreshTokenHash: row.refreshTokenHash,
    userAgent: row.userAgent,
    ipAddress: row.ipAddress,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    createdAt: row.createdAt,
  };
}

@Injectable()
export class KyselySessionRepository extends SessionRepository {
  constructor(@InjectDb() private readonly db: DbTransactionHost) {
    super();
  }

  async create(session: NewSession): Promise<void> {
    await this.db.tx.insertInto('authSessions').values(session).execute();
  }

  async findById(id: string): Promise<Session | null> {
    const row = await this.db.tx
      .selectFrom('authSessions')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async rotate(
    id: string,
    expectedHash: string,
    nextHash: string,
    expiresAt: Date,
  ): Promise<boolean> {
    const result = await this.db.tx
      .updateTable('authSessions')
      .set({ refreshTokenHash: nextHash, expiresAt, updatedAt: new Date() })
      .where('id', '=', id)
      .where('refreshTokenHash', '=', expectedHash)
      .where('revokedAt', 'is', null)
      .executeTakeFirst();
    return result.numUpdatedRows > 0n;
  }

  async revoke(id: string): Promise<void> {
    const now = new Date();
    await this.db.tx
      .updateTable('authSessions')
      .set({ revokedAt: now, updatedAt: now })
      .where('id', '=', id)
      .where('revokedAt', 'is', null)
      .execute();
  }

  async revokeAllForUser(userId: string): Promise<number> {
    const now = new Date();
    const result = await this.db.tx
      .updateTable('authSessions')
      .set({ revokedAt: now, updatedAt: now })
      .where('userId', '=', userId)
      .where('revokedAt', 'is', null)
      .executeTakeFirst();
    return Number(result.numUpdatedRows);
  }

  async deleteExpired(before: Date): Promise<number> {
    const result = await this.db.tx
      .deleteFrom('authSessions')
      .where('expiresAt', '<', before)
      .executeTakeFirst();
    return Number(result.numDeletedRows);
  }
}
