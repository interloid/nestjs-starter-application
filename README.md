# nest-kickstart — Config & Logger

This branch (`feature/logger-config-setup`) adds two foundations to the starter:

1. **Configuration** — environment loading with Zod validation at boot.
2. **Logging** — a structured Pino logger with request correlation, PII redaction, file rotation, and retention.

Built on **NestJS 11**, **TypeScript 5 (strict)**, **Node.js 20 LTS**.

## Quick start

```bash
npm install
cp .env.example .env
npm run start:dev
```

The app boots on `http://localhost:8080` by default. Hit any route and you'll see a structured `request completed` log line carrying correlation and request IDs.

## 1. Configuration

Loaded via `@nestjs/config` and **validated at boot with Zod**. If any variable is missing or malformed, the app refuses to start (fail-fast).

| Variable             | Type                                                         | Default       | Notes                                                                        |
| -------------------- | ------------------------------------------------------------ | ------------- | ---------------------------------------------------------------------------- |
| `NODE_ENV`           | `development` \| `production` \| `test`                      | `development` | Drives log format (pretty vs JSON) and default level                         |
| `PORT`               | number                                                       | `8080`        | HTTP port                                                                    |
| `LOG_LEVEL`          | `fatal` \| `error` \| `warn` \| `info` \| `debug` \| `trace` | `info`        | Pino log level                                                               |
| `LOG_DIR`            | string                                                       | `./logs`      | Directory where rotated log files are written                                |
| `LOG_CLEANUP_CRON`   | cron string                                                  | `0 0 * * *`   | Schedule for the retention cleanup job (default: daily at midnight)          |
| `LOG_RETENTION_DAYS` | number                                                       | `2`           | Delete log files older than this many days; `0` disables age-based retention |

`.env.example`:

```dotenv
# Core
NODE_ENV=development
PORT=8080

# Logging
LOG_LEVEL=info
LOG_DIR=./logs

# Log retention (handled by RetentionScheduler)
LOG_CLEANUP_CRON=0 0 * * *
LOG_RETENTION_DAYS=2
```

The schema lives in `src/config/env.validation.ts`. Add new variables there — they're typed end-to-end via `z.infer`, so `ConfigService<Env, true>.get('NAME', { infer: true })` is fully type-safe.

> **Note:** don't quote the cron value (`LOG_CLEANUP_CRON=0 0 * * *`, not `'0 0 * * *'`) — some parsers keep the quotes and produce an invalid expression. `LOG_RETENTION_DAYS` is coerced from string to number in the schema.

## 2. Logging

A custom `LoggerService` wraps [Pino](https://getpino.io) and implements Nest's `LoggerService` interface, so it serves as the app-wide logger (`app.useLogger(...)` in `main.ts`).

### Features

- **Format by environment** — colorized pretty logs in development, raw structured JSON in production (`NODE_ENV=production`).
- **Service name** — every line carries `service: "nest-kickstart"`.
- **ISO timestamps**.
- **PII redaction** — a default deny-list (`password`, `token`, `accessToken`, `refreshToken`, `apiKey`, `secret`, `authorization`, `cookie`, and common header paths) is replaced with `[REDACTED]`. Override or disable per instance via the `redact` option.
- **Request correlation** — every log emitted during an HTTP request automatically carries `correlationId` and `requestId` (with `traceId`/`spanId` reserved for when OpenTelemetry is added).
- **File output with rotation** — writes `info.<date>.N.log` and `error.<date>.N.log`, rolling daily or at 10 MB, keeping the most recent files.
- **Age-based retention** — a scheduler prunes log files older than `LOG_RETENTION_DAYS`.

### How request IDs flow

1. `CorrelationIdMiddleware` runs first on every request. It reads an inbound `x-correlation-id` / `x-request-id` header or generates a UUID, echoes both back on the response, and stores them in a `RequestContext` (backed by `AsyncLocalStorage`).
2. The middleware calls `next()` **inside** `RequestContext.run(...)`, so the context propagates through controllers, services, and every log call in that request.
3. Pino's `mixin` reads the IDs from `RequestContext` and attaches them to each line.
4. `LoggingInterceptor` emits one `request completed` line per request with `method`, `url`, `statusCode`, and `responseTimeMs` — routed through `LoggerService`, so it inherits redaction and IDs.

Example production line:

```json
{
  "level": 30,
  "time": "2026-06-30T12:17:14.543Z",
  "service": "nest-kickstart",
  "correlationId": "ee3c688e-...",
  "requestId": "5026b36a-...",
  "method": "GET",
  "url": "/",
  "statusCode": 200,
  "responseTimeMs": 2,
  "msg": "request completed"
}
```

### File logging & retention

File output and retention are driven by the `LOG_*` environment variables above, surfaced into `LoggerOptions.file`:

```ts
{
  serviceName: 'nest-kickstart',
  file: {
    directory: process.env.LOG_DIR,           // LOG_DIR
    retentionDays: process.env.LOG_RETENTION_DAYS, // LOG_RETENTION_DAYS
    cleanupCron: process.env.LOG_CLEANUP_CRON,     // LOG_CLEANUP_CRON
    alsoStdout: true,
  },
}
```

- Files are written by `pino-roll` to `logs/info.<date>.N.log` and `logs/error.<date>.N.log`.
- Rotation: rolls **daily** or when a file reaches **10 MB**, whichever comes first; keeps the last 10 rotated files.
- `RetentionScheduler` runs an age-based cleanup on boot and then on the `LOG_CLEANUP_CRON` schedule, deleting `*.log` files older than `LOG_RETENTION_DAYS`.

> **Note:** two retention mechanisms are active — `pino-roll`'s `limit.count` (count-based) and `RetentionScheduler` (age-based). The scheduler is the primary policy; `limit.count` is a disk-usage backstop.

### Required packages

```bash
npm install pino pino-roll @nestjs/schedule cron
npm install --save-dev pino-pretty
```

`ScheduleModule.forRoot()` must be imported in `AppModule` for the retention scheduler to work.
