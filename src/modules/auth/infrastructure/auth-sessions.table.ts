import type { ColumnType, Selectable } from 'kysely';

export interface AuthSessionsTable {
  id: string;
  userId: string;
  refreshTokenHash: string;
  userAgent: string | null;
  ipAddress: string | null;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: ColumnType<Date, Date | undefined, never>;
  updatedAt: ColumnType<Date, Date | undefined, Date>;
}

export type AuthSessionRow = Selectable<AuthSessionsTable>;
