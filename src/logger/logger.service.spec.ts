import {
  LoggerService,
  LOGGER_OPTIONS,
  DEFAULT_REDACT_PATHS,
  type LoggerOptions,
} from './logger.service';
import pino from 'pino';
import { mkdirSync } from 'node:fs';

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


const pinoMock = pino as unknown as jest.Mock;
const mkdirSyncMock = mkdirSync as unknown as jest.Mock;

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

  describe('createPinoInstance — level', () => {
    it('uses the explicit level when provided', () => {
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

  describe('createPinoInstance — format (no file)', () => {
    it('json format produces NO transport', () => {
      LoggerService.createPinoInstance({ format: 'json' });
      expect(lastPinoConfig().transport).toBeUndefined();
    });

    it('pretty format produces a pino-pretty transport', () => {
      LoggerService.createPinoInstance({ format: 'pretty' });
      expect(lastPinoConfig().transport).toMatchObject({
        target: 'pino-pretty',
      });
    });

    it('defaults to pretty outside production', () => {
      process.env.NODE_ENV = 'development';
      LoggerService.createPinoInstance({});
      expect(lastPinoConfig().transport).toMatchObject({
        target: 'pino-pretty',
      });
    });
  });

  describe('createPinoInstance — base / service name', () => {
    it('sets base.service when serviceName is provided', () => {
      LoggerService.createPinoInstance({
        format: 'json',
        serviceName: 'nest-kickstart',
      });
      expect(lastPinoConfig().base).toEqual({ service: 'nest-kickstart' });
    });

    it('leaves base undefined when no serviceName', () => {
      LoggerService.createPinoInstance({ format: 'json' });
      expect(lastPinoConfig().base).toBeUndefined();
    });
  });

  describe('createPinoInstance — redaction', () => {
    it('applies default redact paths when redact is undefined', () => {
      LoggerService.createPinoInstance({ format: 'json' });
      expect(lastPinoConfig().redact).toEqual({
        paths: DEFAULT_REDACT_PATHS,
        censor: '[REDACTED]',
      });
    });

    it('wraps a custom string[] with the default censor', () => {
      LoggerService.createPinoInstance({
        format: 'json',
        redact: ['user.ssn'],
      });
      expect(lastPinoConfig().redact).toEqual({
        paths: ['user.ssn'],
        censor: '[REDACTED]',
      });
    });

    it('disables redaction when given an empty array', () => {
      LoggerService.createPinoInstance({ format: 'json', redact: [] });
      expect(lastPinoConfig().redact).toBeUndefined();
    });

    it('passes through a full redact object unchanged', () => {
      const redact = { paths: ['a'], censor: 'XX', remove: true };
      LoggerService.createPinoInstance({ format: 'json', redact });
      expect(lastPinoConfig().redact).toEqual(redact);
    });
  });

  describe('createPinoInstance — file targets', () => {
    it('creates the directory and builds stdout + info + error targets', () => {
      LoggerService.createPinoInstance({
        format: 'json',
        file: { directory: '/tmp/logs-test' },
      });

      expect(mkdirSyncMock).toHaveBeenCalledWith(expect.stringContaining('logs-test'), {
        recursive: true,
      });

      const targets = lastPinoConfig().transport.targets as any[];
      expect(targets).toHaveLength(3);
      expect(targets.map((t) => t.target)).toEqual(
        expect.arrayContaining(['pino/file', 'pino-roll', 'pino-roll']),
      );
    });

    it('omits the stdout target when alsoStdout is false', () => {
      LoggerService.createPinoInstance({
        format: 'json',
        file: { directory: '/tmp/logs-test', alsoStdout: false },
      });
      const targets = lastPinoConfig().transport.targets as any[];
      expect(targets).toHaveLength(2);
    });

    it('uses pino-pretty for the stdout target in pretty format', () => {
      LoggerService.createPinoInstance({
        format: 'pretty',
        file: { directory: '/tmp/logs-test' },
      });
      const targets = lastPinoConfig().transport.targets as any[];
      expect(targets[0].target).toBe('pino-pretty');
    });
  });

  describe('mixin — request context IDs', () => {
    function getMixin(): () => Record<string, unknown> {
      return lastPinoConfig().mixin as () => Record<string, unknown>;
    }

    it('returns an empty object when no RequestContext is injected', () => {
      new LoggerService({ format: 'pretty' } as LoggerOptions, undefined);
      expect(getMixin()()).toEqual({});
    });

    it('returns only the IDs present in the context', () => {
      const ctx = makeCtx({
        correlationId: 'corr-1',
        requestId: 'req-1',
      });
      new LoggerService({ format: 'pretty' }, ctx);
      expect(getMixin()()).toEqual({
        correlationId: 'corr-1',
        requestId: 'req-1',
      });
    });

    it('includes trace and span when present', () => {
      const ctx = makeCtx({
        correlationId: 'c',
        requestId: 'r',
        traceId: 't',
        spanId: 's',
      });
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

    it('info() defaults context to {} when omitted', () => {
      service.info('hello');
      expect(mockPinoLogger.info).toHaveBeenCalledWith({}, 'hello');
    });

    it('trace() forwards context then message', () => {
      service.trace('t', { a: 1 });
      expect(mockPinoLogger.trace).toHaveBeenCalledWith({ a: 1 }, 't');
    });

    it('log() maps to pino.info with empty context', () => {
      service.log('msg');
      expect(mockPinoLogger.info).toHaveBeenCalledWith({}, 'msg');
    });

    it('log() treats a trailing string as the Nest context', () => {
      service.log('msg', 'UsersController');
      expect(mockPinoLogger.info).toHaveBeenCalledWith({ context: 'UsersController' }, 'msg');
    });

    it('verbose() maps to pino.trace', () => {
      service.verbose('v');
      expect(mockPinoLogger.trace).toHaveBeenCalledWith({}, 'v');
    });

    it('warn() maps to pino.warn', () => {
      service.warn('w');
      expect(mockPinoLogger.warn).toHaveBeenCalledWith({}, 'w');
    });

    it('debug() maps to pino.debug', () => {
      service.debug('d');
      expect(mockPinoLogger.debug).toHaveBeenCalledWith({}, 'd');
    });

    it('fatal() maps to pino.fatal', () => {
      service.fatal('f');
      expect(mockPinoLogger.fatal).toHaveBeenCalledWith({}, 'f');
    });

    it('error() with an Error second arg extracts err {name,message,stack}', () => {
      const err = new Error('boom');
      service.error('failed', err);
      expect(mockPinoLogger.error).toHaveBeenCalledWith(
        {
          err: { name: 'Error', message: 'boom', stack: err.stack },
        },
        'failed',
      );
    });

    it('error() with a plain object uses it directly as context', () => {
      service.error('failed', { userId: 7 });
      expect(mockPinoLogger.error).toHaveBeenCalledWith({ userId: 7 }, 'failed');
    });
  });

  describe('toString (via log message coercion)', () => {
    let service: LoggerService;

    beforeEach(() => {
      service = new LoggerService({ format: 'json' }, undefined);
    });

    it('passes strings through unchanged', () => {
      service.log('plain');
      expect(mockPinoLogger.info).toHaveBeenCalledWith({}, 'plain');
    });

    it('uses Error.message for Error messages', () => {
      service.log(new Error('kaboom'));
      expect(mockPinoLogger.info).toHaveBeenCalledWith({}, 'kaboom');
    });

    it('JSON-stringifies plain objects passed as the message', () => {
      service.fatal({ a: 1 });
      expect(mockPinoLogger.fatal).toHaveBeenCalledWith({}, '{"a":1}');
    });
  });

  describe('child()', () => {
    it('returns a LoggerService wrapping the child pino instance', () => {
      const service = new LoggerService({ format: 'json' }, undefined);
      const child = service.child({ module: 'payments' });

      expect(mockPinoLogger.child).toHaveBeenCalledWith({ module: 'payments' });
      expect(child).toBeInstanceOf(LoggerService);

      child.info('hi');
      expect(mockChildLogger.info).toHaveBeenCalledWith({}, 'hi');
    });
  });
});
