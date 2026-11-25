import { randomBytes } from 'node:crypto';

/**
 * Generates a UUIDv7 (RFC 9562): time-ordered, so new rows land at the end of
 * B-tree indexes (better insert performance than v4) while staying globally
 * unique and safe to generate in the application.
 *
 * IDs are generated in the app (not by the DB) on purpose: entities have an
 * identity before they are persisted, and we do not depend on a vendor-specific
 * function like `gen_random_uuid()` — one less thing to change when switching DB.
 */
export function generateId(): string {
  const bytes = randomBytes(16);
  const timestamp = BigInt(Date.now());

  for (let i = 0; i < 6; i++) {
    bytes[i] = Number((timestamp >> BigInt(8 * (5 - i))) & 0xffn);
  }
  bytes[6] = (bytes[6]! & 0x0f) | 0x70; // version 7
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // RFC 4122 variant

  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
