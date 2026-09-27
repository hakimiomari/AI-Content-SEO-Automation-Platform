import type { Paginated } from '@acsp/shared';
import type { PaginationQueryDto } from '../dto/pagination-query.dto';

export { PaginationQueryDto } from '../dto/pagination-query.dto';

export interface PageArgs {
  skip: number;
  take: number;
}

/** Converts `page`/`limit` into Prisma `skip`/`take`. */
export function toPageArgs(query: Pick<PaginationQueryDto, 'page' | 'limit'>): PageArgs {
  return { skip: (query.page - 1) * query.limit, take: query.limit };
}

/**
 * Builds a Prisma `orderBy` restricted to an allow-list of sortable fields, so clients cannot
 * sort by arbitrary (or sensitive) columns.
 */
export function toOrderBy<F extends string>(
  query: Pick<PaginationQueryDto, 'sort' | 'order'>,
  allowed: readonly F[],
  fallback: F,
): Record<F, 'asc' | 'desc'> {
  const field =
    query.sort && (allowed as readonly string[]).includes(query.sort)
      ? (query.sort as F)
      : fallback;
  return { [field]: query.order } as Record<F, 'asc' | 'desc'>;
}

/** Wraps rows + total count into the shared `Paginated<T>` envelope. */
export function paginate<T>(
  data: T[],
  total: number,
  query: Pick<PaginationQueryDto, 'page' | 'limit'>,
): Paginated<T> {
  return {
    data,
    meta: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    },
  };
}
