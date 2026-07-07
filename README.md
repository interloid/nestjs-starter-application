# NestJS Starter Application

A production-ready NestJS 11 backend starter with authentication, RBAC, observability, and a fully containerized workflow. Built as a foundation for new services — batteries included, opinionated where it matters, extensible everywhere else.

## Features

- **Authentication** — JWT access + refresh tokens (rotation), local (email/password) strategy, argon2 password hashing
- **Authorization** — role-based access control with granular permissions and a `manage` wildcard
- **Email flows** — verification and password reset via single-use, expiring, hashed tokens
- **Background jobs** — BullMQ + Redis for asynchronous email delivery with retries
- **Database** — Prisma 7 with PostgreSQL, multi-file schema, migrations, and seeding
- **Security** — Helmet, CORS, rate limiting, flag-gated CSRF protection, Zod input validation
- **Observability** — structured logging (Pino), health checks (liveness/readiness), New Relic APM
- **API standards** — consistent response envelope, global exception handling, pagination, URI versioning, Swagger docs
- **Tooling** — ESLint, Prettier, Husky, lint-staged, Jest with coverage
- **Containerized** — multi-stage Docker build, Docker Compose, GitHub Actions CI

## Tech Stack

| Layer         | Technology                     |
| ------------- | ------------------------------ |
| Runtime       | Node.js 24 (LTS)               |
| Framework     | NestJS 11                      |
| Language      | TypeScript 5 (strict)          |
| Database      | PostgreSQL + Prisma 7          |
| Cache / Queue | Redis + BullMQ                 |
| Validation    | Zod (`nestjs-zod`)             |
| Auth          | Passport (JWT + Local), argon2 |
| Logging       | Pino                           |
| Monitoring    | New Relic APM                  |
| Testing       | Jest                           |

## Prerequisites

- Node.js 24+
- Docker & Docker Compose
- PostgreSQL (local or remote)
- Redis (or use the bundled Docker Compose service)

## Getting Started

### 1. Clone and install

```bash
git clone https://github.com/interloid/nestjs-starter-application.git
cd nestjs-starter-application
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Fill in your values — see [Environment Variables](#environment-variables).

### 3. Set up the database

```bash
npm run prisma:generate      # generate the Prisma client
npm run prisma:migrate       # apply migrations (dev)
npm run prisma:seed          # seed roles, permissions, admin user
```

Or in one step:

```bash
npm run db:setup             # deploy migrations + seed
```

### 4. Run

**Local (hot reload):**

```bash
npm run start:dev
```

**Docker (app + Redis):**

```bash
npm run docker:up
```

The API is available at `http://localhost:8080/api/v1`.

## Environment Variables

| Variable                      | Description                                    | Default                  |
| ----------------------------- | ---------------------------------------------- | ------------------------ |
| `NODE_ENV`                    | Build mode (`development`/`production`/`test`) | `development`            |
| `APP_ENV`                     | Deployment target (`local`/`cloud`)            | `local`                  |
| `PORT`                        | Server port                                    | `8080`                   |
| `DATABASE_URL`                | PostgreSQL connection string                   | —                        |
| `REDIS_URL`                   | Redis connection string                        | `redis://localhost:6379` |
| `JWT_ACCESS_SECRET`           | Access token secret (≥32 chars)                | —                        |
| `JWT_REFRESH_SECRET`          | Refresh token secret (≥32 chars)               | —                        |
| `JWT_ACCESS_TTL`              | Access token lifetime                          | `15m`                    |
| `JWT_REFRESH_TTL`             | Refresh token lifetime                         | `7d`                     |
| `FRONTEND_URL`                | Frontend base URL (for email links)            | `http://localhost:3000`  |
| `CORS_ORIGINS`                | Comma-separated allowed origins                | `http://localhost:3000`  |
| `CSRF_ENABLED`                | Enable CSRF protection                         | `false`                  |
| `CSRF_SECRET`                 | CSRF signing secret                            | —                        |
| `SMTP_HOST` / `SMTP_PORT`     | SMTP server                                    | —                        |
| `SMTP_USER` / `SMTP_PASSWORD` | SMTP credentials                               | —                        |
| `SMTP_SECURE`                 | TLS (`true` for 465, `false` for 587)          | `false`                  |
| `MAIL_FROM`                   | Sender address                                 | —                        |
| `NEW_RELIC_ENABLED`           | Enable New Relic agent                         | `false`                  |
| `NEW_RELIC_LICENSE_KEY`       | New Relic license key                          | —                        |
| `SWAGGER_ENABLED`             | Expose Swagger docs                            | `true`                   |
| `LOG_LEVEL`                   | Pino log level                                 | `info`                   |
| `GIT_COMMIT`                  | Deployed commit (injected at build)            | `unknown`                |

> **Never commit `.env`.** Secrets are injected at runtime. Use `.env.example` as the template.

## Project Structure

```
src/
├── bootstrap/          # startup wiring (helmet, cors, swagger, versioning)
├── common/             # shared decorators, guards, interceptors, filters, DTOs
├── config/             # environment validation (Zod)
├── logger/             # Pino logger service
├── prisma/             # Prisma service + module
├── mail/               # mail service, queue, processor
├── queue/              # BullMQ root connection
├── auth/               # auth service, strategies, token services, guards
├── user/               # user service
├── observability/
│   └── health/         # health checks + version endpoint
└── main.ts             # thin bootstrap

prisma/
├── schema.prisma       # generator + datasource
├── models/             # domain models (user, rbac, token, enums)
├── migrations/
└── seed.ts
```

## Available Scripts

| Script                          | Description                    |
| ------------------------------- | ------------------------------ |
| `npm run start:dev`             | Run with hot reload            |
| `npm run build`                 | Compile to `dist/`             |
| `npm run lint`                  | Lint and auto-fix              |
| `npm test`                      | Run unit tests                 |
| `npm run test:cov`              | Tests with coverage            |
| `npm run prisma:migrate`        | Create + apply a dev migration |
| `npm run prisma:migrate:deploy` | Apply migrations (prod/CI)     |
| `npm run prisma:seed`           | Seed the database              |
| `npm run prisma:studio`         | Open Prisma Studio             |
| `npm run docker:up`             | Build + run via Docker Compose |
| `npm run docker:down`           | Stop containers                |

## API Overview

All routes are prefixed with `/api/v1`. Health checks are unversioned at `/health`.

### Authentication

| Method | Endpoint                | Description               | Auth     |
| ------ | ----------------------- | ------------------------- | -------- |
| `POST` | `/auth/register`        | Register a new user       | Public   |
| `POST` | `/auth/login`           | Log in, receive tokens    | Public   |
| `POST` | `/auth/refresh`         | Rotate refresh token      | Public   |
| `POST` | `/auth/logout`          | Revoke current session    | Required |
| `POST` | `/auth/logout-all`      | Revoke all sessions       | Required |
| `POST` | `/auth/verify-email`    | Verify email address      | Public   |
| `POST` | `/auth/forgot-password` | Request password reset    | Public   |
| `POST` | `/auth/reset-password`  | Reset password with token | Public   |

### Users

| Method | Endpoint    | Description          | Permission    |
| ------ | ----------- | -------------------- | ------------- |
| `GET`  | `/users/me` | Current user profile | Authenticated |
| `GET`  | `/users`    | List users           | `users:get`   |

### Health

| Method | Endpoint        | Description                        |
| ------ | --------------- | ---------------------------------- |
| `GET`  | `/health/live`  | Liveness (restart signal)          |
| `GET`  | `/health/ready` | Readiness (dependencies + version) |

### Response Envelope

```json
{
  "success": true,
  "statusCode": 200,
  "message": "OK",
  "data": {},
  "timestamp": "2026-07-06T12:00:00Z",
  "path": "/api/v1/users/me",
  "requestId": "..."
}
```

### API Documentation

When `SWAGGER_ENABLED=true`, interactive docs are at `/docs`.

## Authorization Model

Access control is role-based with granular permissions:

- **Permissions** use a `resource:action` format (e.g. `users:update`).
- **Actions**: `get`, `update`, `delete`, `manage`.
- **`manage`** is a wildcard — `users:manage` satisfies any `users:*` requirement, but a specific action never satisfies a required `manage` (grants expand down, never up).
- **Roles** bundle permissions; users are assigned roles.

Protect a route:

```typescript
@RequirePermission('users:update')
@Patch(':id')
updateUser() {}
```

Mark public routes with `@Public()`.

## Testing

```bash
npm test               # unit tests
npm run test:cov       # with coverage
npm run test:e2e       # end-to-end tests
```

## Database Migrations

**Development** — create and apply a migration:

```bash
npm run prisma:migrate -- --name describe_your_change
```

**Production / CI** — apply committed migrations only:

```bash
npm run prisma:migrate:deploy
```

> Author migrations locally with `migrate dev`, commit `prisma/migrations/`, and apply them in production with `migrate deploy`. Never run `migrate dev` in production.

## Docker

The multi-stage `Dockerfile` produces a lean production image; `docker-compose.yml` runs the app alongside Redis.

```bash
npm run docker:up      # build (with commit injected) + start
npm run docker:down    # stop
```

The commit SHA and build time are injected at build time and exposed at `/health/ready` for deploy verification.

## CI

GitHub Actions runs on every push and PR to `main`: lint, type-check, test (with coverage), and build, against Postgres and Redis service containers. See `.github/workflows/ci.yml`.

## Default Seed Credentials

After seeding, an admin account is created:

- **Email:** `admin@example.com`
- **Password:** `Admin@123`

> Change these immediately in any non-local environment.

## License

[Specify your license — e.g. MIT]
