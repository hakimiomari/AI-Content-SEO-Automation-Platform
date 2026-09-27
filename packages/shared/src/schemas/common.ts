import { z } from 'zod';
import { PAGINATION } from '../constants';

export const idSchema = z.string().min(1);

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(PAGINATION.DEFAULT_PAGE),
  limit: z.coerce.number().int().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
  search: z.string().trim().max(200).optional(),
  sort: z.string().max(50).optional(),
  order: z.enum(['asc', 'desc']).default('desc'),
});
export type PaginationQuery = z.infer<typeof paginationSchema>;

export const slugSchema = z
  .string()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and dashes');
