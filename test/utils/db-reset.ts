import { PrismaClient } from '@prisma/client';

/**
 * Truncates all tables in the public/test schema to guarantee a clean slate
 * between sequential tests without dropping the database structure.
 */
export async function resetDb(prisma: PrismaClient) {
  const tableNames = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables 
    WHERE schemaname = current_schema() 
    AND tablename NOT IN ('_prisma_migrations');
  `;

  if (tableNames.length === 0) return;

  const formatTables = tableNames.map((t) => `"${t.tablename}"`).join(', ');

  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${formatTables} CASCADE;`);
}
