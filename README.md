# nestjs-starter-application — Config & Logger

This branch (`feature/logger-config-setup`) adds two foundations to the starter:

1. **Configuration** — environment loading with Zod validation at boot.
2. **Logging** — a structured Pino logger with request correlation, PII redaction, and New Relic integration.

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

| Variable                | Type                                                         | Default       | Notes                                                |
| ----------------------- | ------------------------------------------------------------ | ------------- | ---------------------------------------------------- |
| `NODE_ENV`              | `development` \| `production` \| `test`                      | `development` | Drives log format (pretty vs JSON) and default level |
| `PORT`                  | number                                                       | `8080`        | HTTP port                                            |
| `LOG_LEVEL`             | `fatal` \| `error` \| `warn` \| `info` \| `debug` \| `trace` | `debug`       | Pino log level                                       |
| `NEW_RELIC_APP_NAME`    | string                                                       | —             | Application name reported to New Relic               |
| `NEW_RELIC_LICENSE_KEY` | string                                                       | —             | New Relic ingest license key                         |

`.env.example`:

```dotenv
# =========================
# Server Configuration
# =========================
PORT=8080
NODE_ENV=development

# =========================
# Logging Configuration
# =========================
LOG_LEVEL=debug

# Available levels:
# fatal | error | warn | info | debug | trace

# =========================
# New Relic Configuration
# =========================
NEW_RELIC_APP_NAME=nestjs-starter-app
NEW_RELIC_LICENSE_KEY=YOUR_NEW_RELIC_LICENSE_KEY
```

The schema lives in `src/config/env.validation.ts`. Add new variables there — they're typed end-to-end via `z.infer`, so `ConfigService<Env, true>.get('NAME', { infer: true })` is fully type-safe.

## 2. Logging

A custom `LoggerService` wraps [Pino](https://getpino.io) and implements Nest's `LoggerService` interface, so it serves as the app-wide logger (`app.useLogger(...)` in `main.ts`).

### Features

- **Format by environment** — colorized pretty logs in development, raw structured JSON in production (`NODE_ENV=production`).
- **Service name** — every line carries `service: "nestjs-starter-application"`.
- **ISO timestamps**.
- **PII redaction** — a default deny-list (`password`, `token`, `accessToken`, `refreshToken`, `apiKey`, `secret`, `authorization`, `cookie`, and common header paths) is replaced with `[REDACTED]`. Override or disable per instance via the `redact` option.
- **Request correlation** — every log emitted during an HTTP request automatically carries `correlationId` and `requestId` (with `traceId`/`spanId` reserved for when OpenTelemetry is added).
- **New Relic integration** — logs are enriched with New Relic linking metadata (`@newrelic/pino-enricher`) so they correlate with APM traces in the New Relic UI.

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
  "service": "nestjs-starter-application",
  "correlationId": "ee3c688e-...",
  "requestId": "5026b36a-...",
  "method": "GET",
  "url": "/",
  "statusCode": 200,
  "responseTimeMs": 2,
  "msg": "request completed"
}
```

### New Relic setup

New Relic is configured via the `newrelic` package and enriches Pino logs via `@newrelic/pino-enricher`, so structured logs can be correlated with APM traces in the New Relic dashboard.

Required environment variables:

```dotenv
NEW_RELIC_APP_NAME=nestjs-starter-app
NEW_RELIC_LICENSE_KEY=YOUR_NEW_RELIC_LICENSE_KEY
```

The agent is loaded at process start via `-r newrelic` in the production start script:

```json
"start:prod": "node -r dotenv/config -r newrelic dist/main"
```

> **Note:** in `start:dev`/`start:debug` the New Relic agent isn't preloaded by default. If you want APM data locally, add `-r newrelic` to those scripts as well, or set `NEW_RELIC_ENABLED=false` to suppress agent warnings in development.

### Required packages

```bash
npm install pino @newrelic/pino-enricher newrelic
npm install --save-dev pino-pretty
```
