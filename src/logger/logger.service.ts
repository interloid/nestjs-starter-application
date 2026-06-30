import { Inject, Injectable, Optional, LoggerService as NestLoggerService } from '@nestjs/common';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import pino, { Logger as PinoLogger, TransportTargetOptions } from 'pino';
import { RequestContext } from '../common/context/request-context';

export const LOGGER_OPTIONS = Symbol('LOGGER_OPTIONS');

export const DEFAULT_REDACT_PATHS: string[] = [
  'password',
  '*.password',
  'passwordConfirmation',
  '*.passwordConfirmation',
  'token',
  '*.token',
  'accessToken',
  '*.accessToken',
  'refreshToken',
  '*.refreshToken',
  'apiKey',
  '*.apiKey',
  'secret',
  '*.secret',
  'authorization',
  '*.authorization',
  'cookie',
  '*.cookie',
  'headers.authorization',
  'headers.cookie',
  'req.headers.authorization',
  'req.headers.cookie',
  'request.headers.authorization',
  'request.headers.cookie',
];

export interface LoggerFileOptions {
  directory?: string;
  retentionDays?: number;
  alsoStdout?: boolean;
  cleanupCron?: string;
}

export interface LoggerOptions {
  level?: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
  format?: 'json' | 'pretty';
  serviceName?: string;
  file?: LoggerFileOptions;
  redact?: string[] | { paths: string[]; censor?: string; remove?: boolean };
}

@Injectable()
export class LoggerService implements NestLoggerService {
  private readonly pino: PinoLogger;

  constructor(
    @Inject(LOGGER_OPTIONS) options: LoggerOptions,
    @Optional() private readonly ctx?: RequestContext,
  ) {
    this.pino = LoggerService.createPinoInstance(options, () => {
      if (!this.ctx) return {};

      const correlationId = this.ctx.get('correlationId');
      const requestId = this.ctx.get('requestId');
      const traceId = this.ctx.get('traceId');
      const spanId = this.ctx.get('spanId');

      return {
        ...(correlationId ? { correlationId } : {}),
        ...(requestId ? { requestId } : {}),
        ...(traceId ? { traceId } : {}),
        ...(spanId ? { spanId } : {}),
      };
    });
  }

  static createPinoInstance(
    options: LoggerOptions,
    contextProvider?: () => Record<string, unknown>,
  ): PinoLogger {
    const level = options.level ?? LoggerService.defaultLevelForEnv();
    const format = options.format ?? (process.env['NODE_ENV'] === 'production' ? 'json' : 'pretty');

    const redact = LoggerService.resolveRedact(options.redact);

    const baseConfig = {
      level,
      base: options.serviceName ? { service: options.serviceName } : undefined,
      timestamp: pino.stdTimeFunctions.isoTime,
      ...(contextProvider ? { mixin: contextProvider } : {}),
      ...(redact ? { redact } : {}),
    };

    if (!options.file) {
      if (format === 'pretty') {
        return pino({
          ...baseConfig,
          transport: {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'SYS:HH:MM:ss.l',
              ignore: 'pid,hostname',
            },
          },
        });
      }
      return pino(baseConfig);
    }

    const fileOpts = options.file;
    const directory = resolve(fileOpts.directory ?? './logs');
    mkdirSync(directory, { recursive: true });

    const targets: TransportTargetOptions[] = [];

    if (fileOpts.alsoStdout !== false) {
      targets.push({
        target: format === 'pretty' ? 'pino-pretty' : 'pino/file',
        level,
        options:
          format === 'pretty'
            ? {
                colorize: true,
                translateTime: 'SYS:HH:MM:ss.l',
                ignore: 'pid,hostname',
                destination: 1,
              }
            : { destination: 1 },
      });
    }

    targets.push({
      target: 'pino-roll',
      level,
      options: {
        file: resolve(directory, 'info'),
        size: '10m',
        frequency: 'daily',
        extension: '.log',
        dateFormat: 'yyyy-MM-dd',
        mkdir: true,
        limit: { count: 10 },
      },
    });

    targets.push({
      target: 'pino-roll',
      level: 'error',
      options: {
        file: resolve(directory, 'error'),
        dateFormat: 'yyyy-MM-dd',
        size: '10m',
        frequency: 'daily',
        extension: '.log',
        mkdir: true,
        limit: { count: 10 },
      },
    });

    return pino({
      ...baseConfig,
      transport: { targets },
    });
  }

  fatal(message: unknown, ...optionalParams: unknown[]): void {
    const ctx = this.extractContext(optionalParams);
    this.pino.fatal(ctx, this.toString(message));
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    const ctx = this.extractContext(optionalParams, true);
    this.pino.error(ctx, this.toString(message));
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    const ctx = this.extractContext(optionalParams);
    this.pino.warn(ctx, this.toString(message));
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.pino.info(context ?? {}, message);
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    const ctx = this.extractContext(optionalParams);
    this.pino.debug(ctx, this.toString(message));
  }

  trace(message: string, context?: Record<string, unknown>): void {
    this.pino.trace(context ?? {}, message);
  }

  child(bindings: Record<string, unknown>): LoggerService {
    const childPino = this.pino.child(bindings);
    return LoggerService.fromPino(childPino);
  }

  log(message: unknown, ...optionalParams: unknown[]): void {
    const ctx = this.extractContext(optionalParams);
    this.pino.info(ctx, this.toString(message));
  }

  verbose(message: unknown, ...optionalParams: unknown[]): void {
    const ctx = this.extractContext(optionalParams);
    this.pino.trace(ctx, this.toString(message));
  }

  private toString(value: unknown): string {
    if (typeof value === 'string') return value;
    if (value instanceof Error) return value.message;
    return JSON.stringify(value);
  }

  private static resolveRedact(
    input: LoggerOptions['redact'],
  ): { paths: string[]; censor?: string; remove?: boolean } | undefined {
    if (input === undefined) {
      return { paths: DEFAULT_REDACT_PATHS, censor: '[REDACTED]' };
    }

    if (Array.isArray(input)) {
      if (input.length === 0) return undefined;
      return { paths: input, censor: '[REDACTED]' };
    }

    return input;
  }

  private static fromPino(pinoInstance: PinoLogger): LoggerService {
    const wrapper = Object.create(LoggerService.prototype) as LoggerService;
    Object.defineProperty(wrapper, 'pino', {
      value: pinoInstance,
      writable: false,
    });
    return wrapper;
  }

  private extractContext(params: unknown[], hasTrace = false): Record<string, unknown> {
    if (params.length === 0) return {};

    const result: Record<string, unknown> = {};

    if (params.length === 1 && this.isPlainObject(params[0])) {
      return params[0];
    }

    const last = params[params.length - 1];
    if (typeof last === 'string') {
      result['context'] = last;
    }

    if (hasTrace) {
      const trace = params[0];
      if (typeof trace === 'string') {
        result['trace'] = trace;
      } else if (trace instanceof Error) {
        result['err'] = {
          name: trace.name,
          message: trace.message,
          stack: trace.stack,
        };
      } else if (this.isPlainObject(trace)) {
        Object.assign(result, trace);
      }
    }

    return result;
  }

  private static defaultLevelForEnv(): LoggerOptions['level'] {
    return process.env['NODE_ENV'] === 'production' ? 'info' : 'debug';
  }

  private isPlainObject(value: unknown): value is Record<string, unknown> {
    return (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value) &&
      !(value instanceof Error)
    );
  }
}
