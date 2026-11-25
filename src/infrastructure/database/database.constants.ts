/**
 * DI token for the root `Kysely<Database>` instance.
 *
 * Repositories should NOT inject this directly — inject `TransactionHost`
 * (see transaction.ts) so queries automatically join the ambient transaction.
 * Inject `DATABASE` only for infrastructure concerns (health checks, shutdown).
 */
export const DATABASE = Symbol('DATABASE');
