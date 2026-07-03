import { PaginationMeta, ScrollPagination } from '../response/api-response';

export function buildOffsetMeta(
  total: number,
  page: number,
  recordsPerPage: number,
): PaginationMeta {
  return {
    total,
    page,
    recordsPerPage,
    totalPages: Math.ceil(total / recordsPerPage),
  };
}

export function buildCursorMeta(nextCursor: string | null): ScrollPagination {
  return {
    nextCursor,
    hasMore: nextCursor !== null,
  };
}

export function toSkipTake(page: number, recordsPerPage: number) {
  return { skip: (page - 1) * recordsPerPage, take: recordsPerPage };
}
