import { LoggerService, DEFAULT_REDACT_PATHS, type LoggerOptions } from './logger.service';

const mockChildLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  trace: jest.fn(),
  fatal: jest.fn(),
  child: jest.fn(),
};

const mockPinoLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  trace: jest.fn(),
  fatal: jest.fn(),
  child: jest.fn(() => mockChildLogger),
};

jest.mock('pino', () => {
  const factory = jest.fn(() => mockPinoLogger);
  (factory as unknown as { stdTimeFunctions: unknown }).stdTimeFunctions = {
    isoTime: () => ',"time":"2026-06-30T00:00:00.000Z"',
  };
  return { __esModule: true, default: factory };
});

jest.mock('node:fs', () => ({
  mkdirSync: jest.fn(),
}));

const mockNrMixin = jest.fn(() => ({ 'trace.id': 'tr-1', 'span.id': 'sp-1' }));
jest.mock('@newrelic/pino-enricher', () => {
  const fn = jest.fn(() => ({ mixin: mockNrMixin }));
  return { __esModule: true, default: fn };
});

import pino from 'pino';
import { mkdirSync } from 'node:fs';
import nrPino from '@newrelic/pino-enricher';

const pinoMock = pino as unknown as jest.Mock;
const mkdirSyncMock = mkdirSync as unknown as jest.Mock;
const nrPinoMock = nrPino as unknown as jest.Mock;

function lastPinoConfig(): Record<string, any> {
  const calls = pinoMock.mock.calls;
  return calls[calls.length - 1][0] as Record<string, any>;
}

function makeCtx(values: Record<string, unknown>) {
  return {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConstructorParameters<typeof LoggerService>[1];
}

describe('LoggerService', () => {
  const ORIGINAL_ENV = process.env.NODE_ENV;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NODE_ENV = 'test';
  });

  afterAll(() => {
    process.env.NODE_ENV = ORIGINAL_ENV;
  });

  describe('level', () => {
    it('uses explicit level when provided', () => {
      LoggerService.createPinoInstance({ level: 'warn', format: 'json' });
      expect(lastPinoConfig().level).toBe('warn');
    });

    it('defaults to "debug" outside production', () => {
      process.env.NODE_ENV = 'test';
      LoggerService.createPinoInstance({ format: 'json' });
      expect(lastPinoConfig().level).toBe('debug');
    });

    it('defaults to "info" in production', () => {
      process.env.NODE_ENV = 'production';
      LoggerService.createPinoInstance({ format: 'json' });
      expect(lastPinoConfig().level).toBe('info');
    });
  });

  describe('format (no file, no New Relic)', () => {
    it('json -> no transport', () => {
      LoggerService.createPinoInstance({ format: 'json' });
      expect(lastPinoConfig().transport).toBeUndefined();
    });

    it('pretty -> pino-pretty transport', () => {
      LoggerService.createPinoInstance({ format: 'pretty' });
      expect(lastPinoConfig().transport).toMatchObject({ target: 'pino-pretty' });
    });
  });

  describe('base / service name', () => {
    it('sets base.service when serviceName provided', () => {
      LoggerService.createPinoInstance({ format: 'json', serviceName: 'nest-kickstart' });
      expect(lastPinoConfig().base).toEqual({ service: 'nest-kickstart' });
    });

    it('base undefined without serviceName', () => {
      LoggerService.createPinoInstance({ format: 'json' });
      expect(lastPinoConfig().base).toBeUndefined();
    });
  });

  describe('redaction', () => {
    it('applies default paths when undefined', () => {
      LoggerService.createPinoInstance({ format: 'json' });
      expect(lastPinoConfig().redact).toEqual({
        paths: DEFAULT_REDACT_PATHS,
        censor: '[REDACTED]',
      });
    });

    it('wraps a custom array with default censor', () => {
      LoggerService.createPinoInstance({ format: 'json', redact: ['user.ssn'] });
      expect(lastPinoConfig().redact).toEqual({ paths: ['user.ssn'], censor: '[REDACTED]' });
    });

    it('disables redaction for an empty array', () => {
      LoggerService.createPinoInstance({ format: 'json', redact: [] });
      expect(lastPinoConfig().redact).toBeUndefined();
    });

    it('passes a full redact object through unchanged', () => {
      const redact = { paths: ['a'], censor: 'XX', remove: true };
      LoggerService.createPinoInstance({ format: 'json', redact });
      expect(lastPinoConfig().redact).toEqual(redact);
    });
  });

  describe('New Relic branch', () => {
    it('invokes the enricher and applies a mixin', () => {
      LoggerService.createPinoInstance({ newRelic: true });
      expect(nrPinoMock).toHaveBeenCalled();
      expect(typeof lastPinoConfig().mixin).toBe('function');
    });

    it('does NOT create file targets or a transport', () => {
      LoggerService.createPinoInstance({ newRelic: true });
      expect(lastPinoConfig().transport).toBeUndefined();
      expect(mkdirSyncMock).not.toHaveBeenCalled();
    });

    it('preserves redaction in New Relic mode', () => {
      LoggerService.createPinoInstance({ newRelic: true });
      expect(lastPinoConfig().redact).toEqual({
        paths: DEFAULT_REDACT_PATHS,
        censor: '[REDACTED]',
      });
    });

    it('combined mixin merges context IDs WITH enricher trace/span fields', () => {
      const ctx = makeCtx({ correlationId: 'c-1', requestId: 'r-1' });
      new LoggerService({ newRelic: true } as LoggerOptions, ctx);

      const mixin = lastPinoConfig().mixin as (m: object, l: number) => Record<string, unknown>;
      const result = mixin({}, 30);

      expect(result).toMatchObject({ correlationId: 'c-1', requestId: 'r-1' });
      expect(result).toMatchObject({ 'trace.id': 'tr-1', 'span.id': 'sp-1' });
      expect(mockNrMixin).toHaveBeenCalled();
    });

    it('New Relic branch takes priority over file output', () => {
      LoggerService.createPinoInstance({
        newRelic: true,
        file: { directory: '/tmp/logs' },
      });
      expect(mkdirSyncMock).not.toHaveBeenCalled();
      expect(lastPinoConfig().transport).toBeUndefined();
    });
  });

  describe('file branch (dev)', () => {
    it('creates the directory and builds stdout + info.log + error.log targets', () => {
      LoggerService.createPinoInstance({
        format: 'json',
        file: { directory: '/tmp/logs-test' },
      });

      expect(mkdirSyncMock).toHaveBeenCalledWith(expect.stringContaining('logs-test'), {
        recursive: true,
      });

      const targets = lastPinoConfig().transport.targets as any[];
      expect(targets).toHaveLength(3);
      expect(targets.map((t) => t.target)).toEqual(['pino/file', 'pino/file', 'pino/file']);
    });

    it('info target writes info.log, error target writes error.log at error level', () => {
      LoggerService.createPinoInstance({
        format: 'json',
        file: { directory: '/tmp/logs-test' },
      });
      const targets = lastPinoConfig().transport.targets as any[];
      expect(targets[1].options.destination).toContain('info.log');
      expect(targets[2].options.destination).toContain('error.log');
      expect(targets[2].level).toBe('error');
    });

    it('omits stdout target when alsoStdout is false', () => {
      LoggerService.createPinoInstance({
        format: 'json',
        file: { directory: '/tmp/logs-test', alsoStdout: false },
      });
      const targets = lastPinoConfig().transport.targets as any[];
      expect(targets).toHaveLength(2);
    });

    it('uses pino-pretty for stdout in pretty format', () => {
      LoggerService.createPinoInstance({
        format: 'pretty',
        file: { directory: '/tmp/logs-test' },
      });
      const targets = lastPinoConfig().transport.targets as any[];
      expect(targets[0].target).toBe('pino-pretty');
    });
  });

  describe('mixin (context IDs, non-NR path)', () => {
    function getMixin(): () => Record<string, unknown> {
      return lastPinoConfig().mixin as () => Record<string, unknown>;
    }

    it('returns {} when no RequestContext injected', () => {
      new LoggerService({ format: 'pretty' }, undefined);
      expect(getMixin()()).toEqual({});
    });

    it('returns only the IDs present in context', () => {
      const ctx = makeCtx({ correlationId: 'c', requestId: 'r' });
      new LoggerService({ format: 'pretty' }, ctx);
      expect(getMixin()()).toEqual({ correlationId: 'c', requestId: 'r' });
    });

    it('includes trace and span when present', () => {
      const ctx = makeCtx({ correlationId: 'c', requestId: 'r', traceId: 't', spanId: 's' });
      new LoggerService({ format: 'pretty' }, ctx);
      expect(getMixin()()).toEqual({
        correlationId: 'c',
        requestId: 'r',
        traceId: 't',
        spanId: 's',
      });
    });
  });

  describe('logging methods', () => {
    let service: LoggerService;

    beforeEach(() => {
      service = new LoggerService({ format: 'json' }, undefined);
    });

    it('info() forwards context then message', () => {
      service.info('hello', { foo: 'bar' });
      expect(mockPinoLogger.info).toHaveBeenCalledWith({ foo: 'bar' }, 'hello');
    });

    it('info() defaults context to {}', () => {
      service.info('hello');
      expect(mockPinoLogger.info).toHaveBeenCalledWith({}, 'hello');
    });

    it('trace() forwards context then message', () => {
      service.trace('t', { a: 1 });
      expect(mockPinoLogger.trace).toHaveBeenCalledWith({ a: 1 }, 't');
    });

    it('log() -> pino.info with empty context', () => {
      service.log('msg');
      expect(mockPinoLogger.info).toHaveBeenCalledWith({}, 'msg');
    });

    it('log() treats trailing string as Nest context', () => {
      service.log('msg', 'UsersController');
      expect(mockPinoLogger.info).toHaveBeenCalledWith({ context: 'UsersController' }, 'msg');
    });

    it('verbose() -> pino.trace', () => {
      service.verbose('v');
      expect(mockPinoLogger.trace).toHaveBeenCalledWith({}, 'v');
    });

    it('warn() -> pino.warn', () => {
      service.warn('w');
      expect(mockPinoLogger.warn).toHaveBeenCalledWith({}, 'w');
    });

    it('debug() -> pino.debug', () => {
      service.debug('d');
      expect(mockPinoLogger.debug).toHaveBeenCalledWith({}, 'd');
    });

    it('fatal() -> pino.fatal', () => {
      service.fatal('f');
      expect(mockPinoLogger.fatal).toHaveBeenCalledWith({}, 'f');
    });

    it('error() with an Error second arg extracts err {name,message,stack}', () => {
      const err = new Error('boom');
      service.error('failed', err);
      expect(mockPinoLogger.error).toHaveBeenCalledWith(
        { err: { name: 'Error', message: 'boom', stack: err.stack } },
        'failed',
      );
    });

    it('error() with a plain object uses it directly as context', () => {
      service.error('failed', { userId: 7 });
      expect(mockPinoLogger.error).toHaveBeenCalledWith({ userId: 7 }, 'failed');
    });
  });

  describe('toString coercion', () => {
    let service: LoggerService;

    beforeEach(() => {
      service = new LoggerService({ format: 'json' }, undefined);
    });

    it('passes strings through', () => {
      service.log('plain');
      expect(mockPinoLogger.info).toHaveBeenCalledWith({}, 'plain');
    });

    it('uses Error.message for Errors', () => {
      service.log(new Error('kaboom'));
      expect(mockPinoLogger.info).toHaveBeenCalledWith({}, 'kaboom');
    });

    it('JSON-stringifies plain objects passed as the message position', () => {
      service.fatal({ a: 1 });
      expect(mockPinoLogger.fatal).toHaveBeenCalledWith({}, '{"a":1}');
    });
  });

  describe('child()', () => {
    it('wraps the child pino instance and logs through it', () => {
      const service = new LoggerService({ format: 'json' }, undefined);
      const child = service.child({ module: 'payments' });

      expect(mockPinoLogger.child).toHaveBeenCalledWith({ module: 'payments' });
      expect(child).toBeInstanceOf(LoggerService);

      child.info('hi');
      expect(mockChildLogger.info).toHaveBeenCalledWith({}, 'hi');
    });
  });
});
