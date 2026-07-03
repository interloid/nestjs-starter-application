import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const OffsetPaginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  recordsPerPage: z.coerce.number().int().positive().max(100).default(20),
});
export class OffsetPaginationDto extends createZodDto(OffsetPaginationSchema) {}

const CursorPaginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
});
export class CursorPaginationDto extends createZodDto(CursorPaginationSchema) {}
