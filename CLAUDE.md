# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
npm run start:dev            # hot-reload dev server (http://localhost:8080/api/v1)
npm run build                # nest build → dist/
npm run docker:up            # app + Redis via Docker Compose

# Database (Prisma 7, PostgreSQL)
npm run prisma:generate      # regenerate client after editing prisma/models/*.prisma
npm run prisma:migrate       # create + apply a dev migration
npm run prisma:migrate:create  # generate migration SQL without applying (--create-only)
npm run prisma:migrate:deploy  # apply pending migrations (prod/CI)
npm run prisma:seed          # seed roles, permissions, admin user
npm run db:setup             # migrate:deploy + seed in one step
npm run prisma:studio        # Prisma Studio GUI

# Quality
npm run lint                 # eslint --fix over {src,apps,libs,test}
npm run format               # prettier --write

# Tests (Jest, ts-jest; specs live next to source as *.spec.ts)
npm test                     # all unit tests
npm test -- src/auth/auth.service.spec.ts   # single file
npm test -- -t "should refresh"             # by test name
npm run test:cov             # coverage (collected from *.{service,guard,strategy}.ts)
npm run test:e2e             # e2e (test/jest-e2e.json)
```

Node 24 is required (`.nvmrc`). Husky + lint-staged run eslint/prettier on staged files at commit time.

## Global Request Pipeline

Everything is wired globally in `src/app.module.ts` via `APP_*` providers. Individual controllers usually don't declare guards/interceptors — they opt out with decorators. Execution order:

1. **`CorrelationIdMiddleware`** (`common/middleware`) — runs first, applied in `AppLoggerModule.configure()` for all routes. Extracts/generates `x-correlation-id` and `x-request-id`, sets response headers, and opens an `AsyncLocalStorage` store (`RequestContext`) that downstream code reads (`this.ctx.get('requestId')`).
2. **`ThrottlerGuard`** — three named tiers (`short`/`medium`/`default`). Override per-route with `@Throttle(...)`, bypass with `@SkipThrottle()`.
3. **`CsrfGuard`** — no-op unless `CSRF_ENABLED=true`. Double-submit cookie via `csrf-csrf`; safe methods and `@SkipCsrf()` handlers bypass.
4. **`JwtAuthGuard`** — protects **every** route by default. Mark public routes with `@Public()`. The JWT strategy (`auth/strategies/jwt.strategy.ts`) reads the token from the `access_token` cookie *or* `Authorization: Bearer`, then reloads the user with roles/permissions on each request.
5. **`PermissionsGuard`** — enforces `@RequirePermission('resource:action')`. A user with `resource:manage` satisfies any action on that resource (wildcard logic in `permission.guard.ts`).
6. **`ZodValidationPipe`** (`nestjs-zod`) — DTOs are Zod schemas (`createZodDto`), not class-validator classes.
7. **`ResponseInterceptor`** — wraps every handler's return value in the `ApiResponse` envelope. Opt out with `@RawResponse()` (used for streams/downloads).
8. **`GlobalExceptionFilter`** — catches all errors, normalizes `ZodValidationException` and `HttpException` into the same `ApiResponse.error` envelope, logs 5xx as `error` and 4xx as `warn`.

When adding a route, the default assumptions are: authenticated, rate-limited, response-wrapped. You typically only add decorators to *relax* those defaults.

## Response Envelope

All JSON responses share the `ApiResponse<T>` shape (`common/response/api-response.ts`): `success`, `statusCode`, `message`, `data`, optional `paginationMeta`/`metaData`/`errors`, plus `timestamp`, `path`, `requestId`. Return a plain object/array from a handler and the interceptor wraps it; return an `ApiResponse` instance directly (e.g. `ApiResponse.success({ data, paginationMeta })`) when you need pagination or custom messages. Pagination helpers live in `common/pagination/`.

## Auth Architecture

- **Tokens**: short-lived JWT access + rotating refresh tokens. Refresh tokens are hashed (`token_hash`) and stored per-device in `refresh_tokens` with user-agent/IP; `AuthService.refresh` rotates them. `token.service.ts` signs, `verification-token.service.ts` handles single-use hashed email/reset tokens (`TokenType` enum).
- **Passwords**: argon2 (`auth/services/password.service.ts`).
- **Dual auth modes** — controlled by `COOKIE_AUTH`. When `true`, login sets `httpOnly` `access_token`/`refresh_token` cookies (refresh cookie scoped to `/api/v1/auth/refresh`) and CSRF must be enabled; when `false`, tokens are returned in the response body. `auth.controller.ts` branches on this flag throughout.
- **Email flows**: verification + password reset enqueue BullMQ jobs; delivery is async.

## RBAC

Schema in `prisma/models/rbac.prisma`: `User`–`UserRole`–`Role`–`RolePermission`–`Permission`. Permissions are `resource`/`action` pairs, referenced in code as the string `"resource:action"` (e.g. `@RequirePermission('user:read')`). The JWT strategy flattens a user's roles → permission-name array on every request; `PermissionsGuard` checks membership with `manage`-as-wildcard. Roles/permissions/admin are provisioned by `prisma/seed.ts`.

## Background Jobs (BullMQ + Redis)

`QueueModule` (global) configures the BullMQ connection from `REDIS_URL`. `MailModule` registers the `mail` queue with retry/backoff defaults and hosts `MailProcessor` (a `WorkerHost`) that switches on job name (`email-verification`, `password-reset`). To add async work: register a queue with `BullModule.registerQueue`, inject it to enqueue, and add a `@Processor`-decorated `WorkerHost`.

## Configuration & Env

`ConfigModule` is global and validates the entire environment through a Zod schema at boot (`config/env.validation.ts`) — an invalid env throws with a formatted field list and the app never starts. Read config type-safely with `config.get('KEY', { infer: true })` against `ConfigService<Env, true>`. Notable cross-field rules enforced in `superRefine`: New Relic keys required in production; `CSRF_SECRET` required (≥16 chars) when `CSRF_ENABLED`; `CSRF_ENABLED` required when `COOKIE_AUTH`. Copy `.env.example` → `.env` to start.

## Database Access

Prisma schema is **multi-file** — models live in `prisma/models/*.prisma` (`user`, `token`, `rbac`, `enums`), stitched into `prisma/schema.prisma`. It uses the driver adapter (`@prisma/adapter-pg`) — `PrismaService` constructs a `PrismaPg` adapter from `DATABASE_URL`. All tables/columns are `@map`'d to snake_case. Always run `prisma:generate` after schema edits and create a migration for structural changes.

## Conventions

- **Structure**: one feature per directory (`auth/`, `user/`, `mail/`, `upload/`, `csrf/`), cross-cutting code under `common/` (decorators, guards, interceptors, filters, middleware, pagination, response). Tests are colocated `*.spec.ts`.
- **Validation/DTOs**: Zod via `nestjs-zod` — never class-validator.
- **Logging**: inject `LoggerService` (Pino, New Relic enrichment in non-`local` `APP_ENV`); logs auto-correlate via `RequestContext`.
- **Health**: `GET /health/live` and `/health/ready` are version-neutral and excluded from the `/api` prefix (see `main.ts`); public, un-throttled, CSRF-skipped.
- **Versioning**: URI-based, default `v1` — routes resolve under `/api/v1/...`.
- **Swagger**: served only when `SWAGGER_ENABLED=true`; annotate protected routes with `@ApiBearerAuth('JWT-auth')`.
