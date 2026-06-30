import { promises as fs } from 'node:fs';
import { join } from 'node:path';

export interface RetentionResult {
  scanned: number;
  deleted: number;
  errors: Array<{ file: string; error: string }>;
}

/**
 * Deletes log files in `directory` whose modified time is older than
 * `retentionDays` days. Returns a summary of what was scanned and deleted.
 */
export async function cleanupOldLogFiles(
  directory: string,
  retentionDays: number,
): Promise<RetentionResult> {
  if (retentionDays <= 0) {
    return { scanned: 0, deleted: 0, errors: [] };
  }

  const result: RetentionResult = { scanned: 0, deleted: 0, errors: [] };

  let entries: string[];
  try {
    entries = await fs.readdir(directory);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return result;
    }
    throw err;
  }

  const cutoffMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

  for (const entry of entries) {
    if (!entry.endsWith('.log')) continue;

    const fullPath = join(directory, entry);
    result.scanned++;

    try {
      const stats = await fs.stat(fullPath);
      if (!stats.isFile()) continue;

      if (stats.mtimeMs < cutoffMs) {
        await fs.unlink(fullPath);
        result.deleted++;
      }
    } catch (err) {
      result.errors.push({
        file: entry,
        error: (err as Error).message,
      });
    }
  }

  return result;
}
