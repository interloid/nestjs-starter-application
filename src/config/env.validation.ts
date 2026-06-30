import { z } from 'zod';
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(8080),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  LOG_DIR: z.string().default('./logs'),
  LOG_FILE_NAME: z.string().default('app.log'),
  LOG_RETENTION_DAYS: z.coerce.number().int().positive().default(7),
  LOG_CLEANUP_CRON: z.string().default('0 0 * * *'),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);

  if (!parsed.success) {
    // Flatten errors to get a straightforward field -> error mapping
    const fieldErrors = parsed.error.flatten().fieldErrors;

    const formattedErrors = Object.entries(fieldErrors)
      .map(([field, errors]) => `[${field}]: ${errors?.join(', ')}`)
      .join('\n');

    throw new Error(`\nInvalid environment configuration:\n${formattedErrors}\n`);
  }

  return parsed.data;
}
