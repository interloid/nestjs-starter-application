import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import pino from 'pino';
import nrPino from '@newrelic/pino-enricher';
import { LoggerService, DEFAULT_REDACT_PATHS, LoggerOptions } from './logger.service';
import type { RequestContext } from '../common/context/request-context';

jest.mock('node:fs', () => ({
  mkdirSync: jest.fn(),
}));
jest.mock('pino', () => {
  const loggerInstance = {
    fatal: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    trace: jest.fn(),
    child: jest.fn(),
  };
  const pinoFn = jest.fn(() => loggerInstance);
  (pinoFn as unknown as { stdTimeFunctions: { isoTime: jest.Mock } }).stdTimeFunctions = {
    isoTime: jest.fn(),
  };
  return {
    __esModule: true,
    default: pinoFn,
  };
});

type MockPinoLogger = {
  fatal: jest.Mock;
  error: jest.Mock;
  warn: jest.Mock;
  info: jest.Mock;
  debug: jest.Mock;
  trace: jest.Mock;
  child: jest.Mock;
};

type MockPinoFactory = jest.Mock<MockPinoLogger, [Record<string, unknown>]> & {
  stdTimeFunctions: { isoTime: jest.Mock };
};

const pinoMock = pino as unknown as MockPinoFactory;
const nrPinoMock = nrPino as unknown as jest.Mock;
const mkdirSyncMock = mkdirSync as unknown as jest.Mock;

const getPinoInstance = (): MockPinoLogger => {
  const { results } = pinoMock.mock;
  return results[results.length - 1].value as MockPinoLogger;
};

const getLastPinoConfig = (): Record<string, unknown> => {
  const { calls } = pinoMock.mock;
  return calls[calls.length - 1][0];
};

class FakeRequestContext {
  private readonly store = new Map<string, unknown>();

  set(key: string, value: unknown): void {
    this.store.set(key, value);
  }

  get(key: string): unknown {
    return this.store.get(key);
  }
}

const toRequestContext = (fake: FakeRequestContext): RequestContext =>
  fake as unknown as RequestContext;

const buildOptions = (overrides: Partial<LoggerOptions> = {}): LoggerOptions => ({
  ...overrides,
});

describe('LoggerService', () => {
  const originalEnv = process.env['NODE_ENV'];

  afterEach(() => {
    jest.clearAllMocks();
    process.env['NODE_ENV'] = originalEnv;
  });

  describe('createPinoInstance - level & format resolution', () => {
    it('defaults to debug level and pretty format outside production', () => {
      process.env['NODE_ENV'] = 'development';
      LoggerService.createPinoInstance({});
      const config = getLastPinoConfig();
      expect(config['level']).toBe('debug');
      expect(config['transport']).toEqual({
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:HH:MM:ss.l',
          ignore: 'pid,hostname',
        },
      });
    });

    it('defaults to info level and json format in production', () => {
      process.env['NODE_ENV'] = 'production';
      LoggerService.createPinoInstance({});
      const config = getLastPinoConfig();
      expect(config['level']).toBe('info');
      expect(config['transport']).toBeUndefined();
    });

    it('honors an explicit level and format override', () => {
      process.env['NODE_ENV'] = 'production';
      LoggerService.createPinoInstance({ level: 'trace', format: 'pretty' });
      const config = getLastPinoConfig();
      expect(config['level']).toBe('trace');
      expect(config['transport']).toBeDefined();
    });

    it('sets base service name when provided', () => {
      LoggerService.createPinoInstance({ serviceName: 'my-svc' });
      expect(getLastPinoConfig()['base']).toEqual({ service: 'my-svc' });
    });

    it('omits base when no service name is provided', () => {
      LoggerService.createPinoInstance({});
      expect(getLastPinoConfig()['base']).toBeUndefined();
    });

    it('uses pino stdTimeFunctions.isoTime for timestamps', () => {
      LoggerService.createPinoInstance({});
      expect(getLastPinoConfig()['timestamp']).toBe(pinoMock.stdTimeFunctions.isoTime);
    });
  });

  describe('createPinoInstance - redact resolution', () => {
    it('applies default redact paths when redact is not provided', () => {
      LoggerService.createPinoInstance({});
      expect(getLastPinoConfig()['redact']).toEqual({
        paths: DEFAULT_REDACT_PATHS,
        censor: '[REDACTED]',
      });
    });

    it('uses a provided array of redact paths', () => {
      LoggerService.createPinoInstance({ redact: ['foo', 'bar'] });
      expect(getLastPinoConfig()['redact']).toEqual({
        paths: ['foo', 'bar'],
        censor: '[REDACTED]',
      });
    });

    it('omits redact entirely when given an empty array', () => {
      LoggerService.createPinoInstance({ redact: [] });
      expect(getLastPinoConfig()['redact']).toBeUndefined();
    });

    it('passes through a redact object unchanged', () => {
      const redact = { paths: ['x'], censor: '***', remove: true };
      LoggerService.createPinoInstance({ redact });
      expect(getLastPinoConfig()['redact']).toBe(redact);
    });
  });

  describe('createPinoInstance - mixin / contextProvider', () => {
    it('does not include a mixin when no contextProvider is given', () => {
      LoggerService.createPinoInstance({});
      expect(getLastPinoConfig()['mixin']).toBeUndefined();
    });

    it('includes the contextProvider as mixin when provided', () => {
      const contextProvider = jest.fn(() => ({ requestId: '1' }));
      LoggerService.createPinoInstance({}, contextProvider);
      expect(getLastPinoConfig()['mixin']).toBe(contextProvider);
    });
  });

  describe('createPinoInstance - New Relic integration', () => {
    it('merges contextProvider and New Relic mixin output', () => {
      nrPinoMock.mockReturnValue({
        mixin: jest.fn((_merge: object, _level: number) => ({ nr: true })),
        someNrOption: 'x',
      });
      const contextProvider = jest.fn(() => ({ requestId: 'abc' }));

      LoggerService.createPinoInstance({ newRelic: true }, contextProvider);

      const config = getLastPinoConfig();
      expect(config['someNrOption']).toBe('x');
      const mixin = config['mixin'] as (m: object, l: number) => Record<string, unknown>;
      expect(mixin({}, 30)).toEqual({ requestId: 'abc', nr: true });
    });

    it('works when the New Relic config has no mixin function', () => {
      nrPinoMock.mockReturnValue({ someNrOption: 'y' });
      const contextProvider = jest.fn(() => ({ requestId: 'abc' }));

      LoggerService.createPinoInstance({ newRelic: true }, contextProvider);

      const mixin = getLastPinoConfig()['mixin'] as (
        m: object,
        l: number,
      ) => Record<string, unknown>;
      expect(mixin({}, 30)).toEqual({ requestId: 'abc' });
    });

    it('works when no contextProvider is supplied', () => {
      nrPinoMock.mockReturnValue({ mixin: jest.fn(() => ({ nr: true })) });

      LoggerService.createPinoInstance({ newRelic: true });

      const mixin = getLastPinoConfig()['mixin'] as (
        m: object,
        l: number,
      ) => Record<string, unknown>;
      expect(mixin({}, 30)).toEqual({ nr: true });
    });

    it('re-applies redact on top of the New Relic config', () => {
      nrPinoMock.mockReturnValue({ redact: { paths: ['nr-only'] } });

      LoggerService.createPinoInstance({ newRelic: true, redact: ['custom'] });

      expect(getLastPinoConfig()['redact']).toEqual({ paths: ['custom'], censor: '[REDACTED]' });
    });
  });

  describe('createPinoInstance - without file transport', () => {
    it('builds a pino-pretty transport in pretty mode', () => {
      LoggerService.createPinoInstance({ format: 'pretty' });
      expect(getLastPinoConfig()['transport']).toEqual({
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:HH:MM:ss.l',
          ignore: 'pid,hostname',
        },
      });
    });

    it('calls pino with the base config directly in json mode', () => {
      LoggerService.createPinoInstance({ format: 'json' });
      const config = getLastPinoConfig();
      expect(config['transport']).toBeUndefined();
      expect(config['level']).toBeDefined();
    });
  });

  describe('createPinoInstance - file transport', () => {
    it('creates the log directory recursively, defaulting to ./logs', () => {
      LoggerService.createPinoInstance({ file: {} });
      expect(mkdirSyncMock).toHaveBeenCalledWith(resolve('./logs'), { recursive: true });
    });

    it('creates the log directory at a custom path', () => {
      LoggerService.createPinoInstance({ file: { directory: './custom-logs' } });
      expect(mkdirSyncMock).toHaveBeenCalledWith(resolve('./custom-logs'), { recursive: true });
    });

    it('includes a stdout target by default (pretty format)', () => {
      LoggerService.createPinoInstance({ format: 'pretty', file: {} });
      const { targets } = getLastPinoConfig()['transport'] as {
        targets: Array<Record<string, unknown>>;
      };
      expect(targets).toHaveLength(3);
      expect(targets[0]).toMatchObject({
        target: 'pino-pretty',
        options: expect.objectContaining({ destination: 1 }),
      });
    });

    it('includes a stdout target by default (json format)', () => {
      LoggerService.createPinoInstance({ format: 'json', file: {} });
      const { targets } = getLastPinoConfig()['transport'] as {
        targets: Array<Record<string, unknown>>;
      };
      expect(targets[0]).toMatchObject({ target: 'pino/file', options: { destination: 1 } });
    });

    it('omits the stdout target when alsoStdout is false', () => {
      LoggerService.createPinoInstance({ file: { alsoStdout: false } });
      const { targets } = getLastPinoConfig()['transport'] as {
        targets: Array<Record<string, unknown>>;
      };
      expect(targets).toHaveLength(2);
    });

    it('includes the stdout target when alsoStdout is explicitly true', () => {
      LoggerService.createPinoInstance({ file: { alsoStdout: true } });
      const { targets } = getLastPinoConfig()['transport'] as {
        targets: Array<Record<string, unknown>>;
      };
      expect(targets).toHaveLength(3);
    });

    it('always appends info.log and error.log file targets', () => {
      LoggerService.createPinoInstance({ level: 'warn', file: { directory: './logs-dir' } });
      const { targets } = getLastPinoConfig()['transport'] as {
        targets: Array<{ target: string; level: string; options: { destination?: string } }>;
      };
      const infoTarget = targets.find((t) =>
        t.options.destination?.toString().endsWith('info.log'),
      );
      const errorTarget = targets.find((t) =>
        t.options.destination?.toString().endsWith('error.log'),
      );
      expect(infoTarget).toMatchObject({ target: 'pino/file', level: 'warn' });
      expect(errorTarget).toMatchObject({ target: 'pino/file', level: 'error' });
    });
  });

  describe('constructor mixin (RequestContext wiring)', () => {
    it('returns an empty object when there is no RequestContext', () => {
      new LoggerService(buildOptions());
      const mixin = getLastPinoConfig()['mixin'] as () => Record<string, unknown>;
      expect(mixin()).toEqual({});
    });

    it('returns an empty object when the context has no values set', () => {
      const ctx = toRequestContext(new FakeRequestContext());
      new LoggerService(buildOptions(), ctx);
      const mixin = getLastPinoConfig()['mixin'] as () => Record<string, unknown>;
      expect(mixin()).toEqual({});
    });

    it('includes only the context values that are set', () => {
      const fake = new FakeRequestContext();
      fake.set('correlationId', 'corr-1');
      fake.set('traceId', 'trace-1');
      new LoggerService(buildOptions(), toRequestContext(fake));
      const mixin = getLastPinoConfig()['mixin'] as () => Record<string, unknown>;
      expect(mixin()).toEqual({ correlationId: 'corr-1', traceId: 'trace-1' });
    });

    it('includes all context values when every one is set', () => {
      const fake = new FakeRequestContext();
      fake.set('correlationId', 'c');
      fake.set('requestId', 'r');
      fake.set('traceId', 't');
      fake.set('spanId', 's');
      new LoggerService(buildOptions(), toRequestContext(fake));
      const mixin = getLastPinoConfig()['mixin'] as () => Record<string, unknown>;
      expect(mixin()).toEqual({ correlationId: 'c', requestId: 'r', traceId: 't', spanId: 's' });
    });
  });

  describe('logging methods', () => {
    let service: LoggerService;
    let pinoInstance: MockPinoLogger;

    beforeEach(() => {
      service = new LoggerService({});
      pinoInstance = getPinoInstance();
    });

    describe('message stringification (toString)', () => {
      it('passes a plain string message through untouched', () => {
        service.log('hello world');
        expect(pinoInstance.info).toHaveBeenCalledWith({}, 'hello world');
      });

      it('extracts the message from an Error', () => {
        service.log(new Error('boom'));
        expect(pinoInstance.info).toHaveBeenCalledWith({}, 'boom');
      });

      it('JSON-stringifies any other value', () => {
        service.log({ a: 1 });
        expect(pinoInstance.info).toHaveBeenCalledWith({}, JSON.stringify({ a: 1 }));
      });
    });

    describe('extractContext - general branches', () => {
      it('returns an empty context when no optional params are given', () => {
        service.log('msg');
        expect(pinoInstance.info).toHaveBeenCalledWith({}, 'msg');
      });

      it('uses a single plain object param directly as context', () => {
        service.log('msg', { userId: 42 });
        expect(pinoInstance.info).toHaveBeenCalledWith({ userId: 42 }, 'msg');
      });

      it('does not treat an array as a plain object', () => {
        service.log('msg', ['x', 'y']);
        expect(pinoInstance.info).toHaveBeenCalledWith({}, 'msg');
      });

      it('does not treat null as a plain object', () => {
        service.log('msg', null);
        expect(pinoInstance.info).toHaveBeenCalledWith({}, 'msg');
      });

      it('does not treat an Error as a plain-object context', () => {
        service.log('msg', new Error('nope'));
        expect(pinoInstance.info).toHaveBeenCalledWith({}, 'msg');
      });

      it('treats a single string param as the "context" field', () => {
        service.debug('msg', 'MyContext');
        expect(pinoInstance.debug).toHaveBeenCalledWith({ context: 'MyContext' }, 'msg');
      });

      it('uses the last string param as "context" among multiple params', () => {
        service.warn('msg', 'ignored-first', 'LastContext');
        expect(pinoInstance.warn).toHaveBeenCalledWith({ context: 'LastContext' }, 'msg');
      });

      it('does not set context when the last param is not a string', () => {
        service.fatal('msg', 123);
        expect(pinoInstance.fatal).toHaveBeenCalledWith({}, 'msg');
      });
    });

    describe('extractContext - trace handling (error method)', () => {
      it('returns a single plain object early even when hasTrace is true', () => {
        service.error('msg', { already: 'context' });
        expect(pinoInstance.error).toHaveBeenCalledWith({ already: 'context' }, 'msg');
      });

      it('sets "trace" when the first param is a string', () => {
        service.error('msg', 'stack trace text');
        expect(pinoInstance.error).toHaveBeenCalledWith(
          { context: 'stack trace text', trace: 'stack trace text' },
          'msg',
        );
      });

      it('sets "err" details when the first param is an Error', () => {
        const err = new Error('failure');
        service.error('msg', err, 'ErrContext');
        expect(pinoInstance.error).toHaveBeenCalledWith(
          {
            context: 'ErrContext',
            err: { name: err.name, message: err.message, stack: err.stack },
          },
          'msg',
        );
      });

      it('merges a plain object first param into the context', () => {
        service.error('msg', { code: 'E1' }, 'ErrContext');
        expect(pinoInstance.error).toHaveBeenCalledWith(
          { context: 'ErrContext', code: 'E1' },
          'msg',
        );
      });

      it('ignores a first param that is neither string, Error, nor plain object', () => {
        service.error('msg', 42, 'ErrContext');
        expect(pinoInstance.error).toHaveBeenCalledWith({ context: 'ErrContext' }, 'msg');
      });
    });

    describe('info and trace (context-object signature)', () => {
      it('info passes the given context object', () => {
        service.info('msg', { a: 1 });
        expect(pinoInstance.info).toHaveBeenCalledWith({ a: 1 }, 'msg');
      });

      it('info defaults to an empty context object', () => {
        service.info('msg');
        expect(pinoInstance.info).toHaveBeenCalledWith({}, 'msg');
      });

      it('trace passes the given context object', () => {
        service.trace('msg', { b: 2 });
        expect(pinoInstance.trace).toHaveBeenCalledWith({ b: 2 }, 'msg');
      });

      it('trace defaults to an empty context object', () => {
        service.trace('msg');
        expect(pinoInstance.trace).toHaveBeenCalledWith({}, 'msg');
      });
    });

    it('verbose delegates to pino.trace', () => {
      service.verbose('msg', { v: true });
      expect(pinoInstance.trace).toHaveBeenCalledWith({ v: true }, 'msg');
    });

    it('fatal delegates to pino.fatal', () => {
      service.fatal('boom');
      expect(pinoInstance.fatal).toHaveBeenCalledWith({}, 'boom');
    });

    it('warn delegates to pino.warn', () => {
      service.warn('careful');
      expect(pinoInstance.warn).toHaveBeenCalledWith({}, 'careful');
    });

    it('debug delegates to pino.debug', () => {
      service.debug('detail');
      expect(pinoInstance.debug).toHaveBeenCalledWith({}, 'detail');
    });

    it('log delegates to pino.info', () => {
      service.log('generic');
      expect(pinoInstance.info).toHaveBeenCalledWith({}, 'generic');
    });
  });

  describe('child()', () => {
    it('creates a new LoggerService wrapping the child pino logger', () => {
      const service = new LoggerService({});
      const parentPino = getPinoInstance();

      const childPinoInstance: MockPinoLogger = {
        fatal: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        info: jest.fn(),
        debug: jest.fn(),
        trace: jest.fn(),
        child: jest.fn(),
      };
      parentPino.child.mockReturnValue(childPinoInstance);

      const child = service.child({ module: 'orders' });

      expect(parentPino.child).toHaveBeenCalledWith({ module: 'orders' });
      expect(child).toBeInstanceOf(LoggerService);

      child.info('child message');
      expect(childPinoInstance.info).toHaveBeenCalledWith({}, 'child message');
    });
  });
});
