import { z } from 'zod';
export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    APP_ENV: z.enum(['local', 'development', 'staging', 'production']).default('local'),
    PORT: z.coerce.number().int().positive().default(8080),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    NEW_RELIC_APP_NAME: z.string().optional(),
    NEW_RELIC_LICENSE_KEY: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production') {
      if (!env.NEW_RELIC_APP_NAME) {
        ctx.addIssue({
          code: 'custom',
          path: ['NEW_RELIC_APP_NAME'],
          message: 'NEW_RELIC_APP_NAME is required in production',
        });
      }

      if (!env.NEW_RELIC_LICENSE_KEY) {
        ctx.addIssue({
          code: 'custom',
          path: ['NEW_RELIC_LICENSE_KEY'],
          message: 'NEW_RELIC_LICENSE_KEY is required in production',
        });
      }
    }
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
