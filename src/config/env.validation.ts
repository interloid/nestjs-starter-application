import { z } from 'zod';
export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

    APP_ENV: z.enum(['local', 'development', 'staging', 'production']).default('local'),

    PORT: z.coerce.number().int().positive().default(8080),

    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

    NEW_RELIC_APP_NAME: z.string().optional(),

    NEW_RELIC_LICENSE_KEY: z.string().optional(),

    CORS_ORIGINS: z.string().default('http://localhost:3000'),

    CSRF_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),

    CSRF_SECRET: z.string().min(16).optional(),

    GIT_COMMIT: z.string().default('unknown'),

    BUILD_TIME: z.string().default('unknown'),

    SWAGGER_ENABLED: z
      .preprocess((val) => {
        if (val === 'true') return true;
        if (val === 'false') return false;
        return val;
      }, z.boolean())
      .default(false),

    DATABASE_URL: z.url(),

    JWT_ACCESS_SECRET: z.string().min(32),
    JWT_REFRESH_SECRET: z.string().min(32),
    JWT_ACCESS_TTL: z.string().default('15m'),
    JWT_REFRESH_TTL: z.string().default('7d'),

    REDIS_URL: z.url(),

    FRONTEND_URL: z.url(),

    SMTP_HOST: z.string(),
    SMTP_PORT: z.coerce.number().default(587),
    SMTP_USER: z.string(),
    SMTP_PASSWORD: z.string(),
    MAIL_FROM: z.email().default('no-reply@example.com'),

    COOKIE_AUTH: z
      .preprocess((val) => {
        if (val === 'true') return true;
        if (val === 'false') return false;
        return val;
      }, z.boolean())
      .default(false),

    AWS_ACCESS_KEY_ID: z.string().min(1, 'AWS Access Key is required'),
    AWS_SECRET_ACCESS_KEY: z.string().min(1, 'AWS Secret Access Key is required'),
    AWS_REGION: z.string().min(1, 'AWS Region is required').default('us-east-1'),
    AWS_S3_BUCKET_NAME: z.string().min(1, 'S3 Bucket Name is required'),
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
    if (env.CSRF_ENABLED && (!env.CSRF_SECRET || env.CSRF_SECRET.trim().length < 16)) {
      ctx.addIssue({
        code: 'custom',
        path: ['CSRF_SECRET'],
        message:
          'CSRF_SECRET is required and must be at least 16 characters long when CSRF_ENABLED is true',
      });
    }
    if (env.COOKIE_AUTH && !env.CSRF_ENABLED) {
      ctx.addIssue({
        code: 'custom',
        path: ['CSRF_ENABLED'],
        message:
          'CSRF_ENABLED must be true when COOKIE_AUTH is enabled to prevent cross-site exploits',
      });
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
