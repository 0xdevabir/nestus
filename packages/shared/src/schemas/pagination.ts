import { z } from 'zod';

/** Standard cursor pagination query used by all list endpoints. */
export const paginationQuery = z.object({
  cursor: z.string().cuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export type PaginationQuery = z.infer<typeof paginationQuery>;
