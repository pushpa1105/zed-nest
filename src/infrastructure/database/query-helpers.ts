/**
 * Small, dialect-neutral helpers shared by repositories.
 */

/** Escapes `%`, `_` and `\` so user input is matched literally inside LIKE/ILIKE patterns. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}
