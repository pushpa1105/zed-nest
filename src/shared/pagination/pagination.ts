import { z } from 'zod';

/**
 * Offset pagination primitives shared by every feature.
 *
 *  - `paginationQuerySchema`  → validate `?page=&limit=` query params
 *  - `PageRequest`            → what services/repositories receive
 *  - `Page<T>`                → what services return
 *  - `pageResponseSchema()`   → OpenAPI/response contract for a page of T
 *
 * For very large tables prefer keyset (cursor) pagination — see docs/14-recipes.md.
 */
export const MAX_PAGE_SIZE = 100;

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(20),
});

export type PageRequest = z.infer<typeof paginationQuerySchema>;

export interface PageMeta {
  readonly page: number;
  readonly limit: number;
  readonly totalItems: number;
  readonly totalPages: number;
}

export interface Page<T> {
  readonly items: readonly T[];
  readonly meta: PageMeta;
}

export function toOffset({ page, limit }: PageRequest): number {
  return (page - 1) * limit;
}

export function buildPage<T>(
  items: readonly T[],
  totalItems: number,
  request: PageRequest,
): Page<T> {
  return {
    items,
    meta: {
      page: request.page,
      limit: request.limit,
      totalItems,
      totalPages: Math.ceil(totalItems / request.limit),
    },
  };
}

export function mapPage<T, R>(page: Page<T>, fn: (item: T) => R): Page<R> {
  return { items: page.items.map(fn), meta: page.meta };
}

export const pageMetaSchema = z.object({
  page: z.number().int(),
  limit: z.number().int(),
  totalItems: z.number().int(),
  totalPages: z.number().int(),
});

export function pageResponseSchema<T extends z.ZodType>(item: T) {
  return z.object({ items: z.array(item), meta: pageMetaSchema });
}
