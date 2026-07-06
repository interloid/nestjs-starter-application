
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { CsrfGuard } from './csrf.guard';
import { SKIP_CSRF_KEY } from '../common/decorators/skip-csrf.decorator';
import type { Env } from '../config/env.validation';

const mockValidateRequest = jest.fn();
jest.mock('csrf-csrf', () => ({
  doubleCsrf: jest.fn(() => ({ validateRequest: mockValidateRequest })),
}));


type Flags = Partial<Record<'CSRF_ENABLED' | 'CSRF_SECRET' | 'NODE_ENV', string | boolean>>;

function makeConfig(flags: Flags): ConfigService<Env, true> {
  const values: Flags = {
    CSRF_ENABLED: true,
    CSRF_SECRET: 'test-secret',
    NODE_ENV: 'test',
    ...flags,
  };
  return {
    get: jest.fn((key: keyof Flags) => values[key]),
  } as unknown as ConfigService<Env, true>;
}

function makeReflector(skip = false): Reflector {
  return {
    getAllAndOverride: jest.fn(() => skip),
  } as unknown as Reflector;
}

function mockContext(method = 'POST'): ExecutionContext {
  const req = { method, headers: {}, ip: '127.0.0.1' };
  const res = {};
  return {
    getHandler: jest.fn(() => 'handlerRef'),
    getClass: jest.fn(() => 'classRef'),
    switchToHttp: jest.fn(() => ({
      getRequest: jest.fn(() => req),
      getResponse: jest.fn(() => res),
    })),
  } as unknown as ExecutionContext;
}

describe('CsrfGuard', () => {
  afterEach(() => jest.clearAllMocks());


  describe('when CSRF is disabled', () => {
    it('allows all requests without validating', () => {
      const guard = new CsrfGuard(makeReflector(), makeConfig({ CSRF_ENABLED: false }));
      expect(guard.canActivate(mockContext('POST'))).toBe(true);
      expect(mockValidateRequest).not.toHaveBeenCalled();
    });
  });


  describe('when enabled but secret is missing', () => {
    it('throws at construction', () => {
      expect(
        () => new CsrfGuard(makeReflector(), makeConfig({ CSRF_ENABLED: true, CSRF_SECRET: '' })),
      ).toThrow('CSRF_ENABLED is true but CSRF_SECRET is not set');
    });
  });


  describe('when CSRF is enabled', () => {
    it('allows safe methods without validation (GET/HEAD/OPTIONS)', () => {
      const guard = new CsrfGuard(makeReflector(), makeConfig({}));
      for (const method of ['GET', 'HEAD', 'OPTIONS']) {
        expect(guard.canActivate(mockContext(method))).toBe(true);
      }
      expect(mockValidateRequest).not.toHaveBeenCalled();
    });

    it('allows a route decorated with @SkipCsrf()', () => {
      const guard = new CsrfGuard(makeReflector(true), makeConfig({})); // skip = true
      expect(guard.canActivate(mockContext('POST'))).toBe(true);
      expect(mockValidateRequest).not.toHaveBeenCalled();
    });

    it('checks the reflector on handler and class for @SkipCsrf', () => {
      const reflector = makeReflector(false);
      const guard = new CsrfGuard(reflector, makeConfig({}));
      mockValidateRequest.mockReturnValueOnce(true);

      guard.canActivate(mockContext('POST'));

      expect(reflector.getAllAndOverride).toHaveBeenCalledWith(SKIP_CSRF_KEY, [
        'handlerRef',
        'classRef',
      ]);
    });

    it('passes a state-changing request when the token is valid', () => {
      const guard = new CsrfGuard(makeReflector(false), makeConfig({}));
      mockValidateRequest.mockReturnValueOnce(true);

      expect(guard.canActivate(mockContext('POST'))).toBe(true);
      expect(mockValidateRequest).toHaveBeenCalledTimes(1);
    });

    it('throws ForbiddenException when the token is invalid', () => {
      const guard = new CsrfGuard(makeReflector(false), makeConfig({}));
      mockValidateRequest.mockReturnValueOnce(false);

      expect(() => guard.canActivate(mockContext('POST'))).toThrow(ForbiddenException);
      expect(() => {
        mockValidateRequest.mockReturnValueOnce(false);
        return new CsrfGuard(makeReflector(false), makeConfig({})).canActivate(mockContext('POST'));
      }).toThrow('Invalid CSRF token');
    });

    it('validates for each state-changing method (POST/PUT/PATCH/DELETE)', () => {
      const guard = new CsrfGuard(makeReflector(false), makeConfig({}));
      for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
        mockValidateRequest.mockReturnValueOnce(true);
        expect(guard.canActivate(mockContext(method))).toBe(true);
      }
    });
  });
});
