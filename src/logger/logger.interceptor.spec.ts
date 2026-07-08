import { Test, TestingModule } from '@nestjs/testing';
import { LoggerService } from './logger.service';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import type { Request, Response } from 'express';
import { LoggingInterceptor } from './logger.interceptor';

describe('LoggingInterceptor', () => {
  let interceptor: LoggingInterceptor;
  let loggerService: jest.Mocked<LoggerService>;

  const mockRequest = {
    method: 'POST',
    originalUrl: '/api/v1/auth/login',
    ip: '127.0.0.1',
    headers: {
      'user-agent': 'Jest-Test-Agent',
    },
  } as unknown as Request;

  const mockResponse = {
    statusCode: 200,
  } as unknown as Response;

  // Context Mock Factory Helper
  function createMockContext(contextType: string = 'http'): ExecutionContext {
    return {
      getType: jest.fn(function (this: void) {
        return contextType;
      }),
      switchToHttp: jest.fn(function (this: void) {
        return {
          getRequest: jest.fn(function (this: void) {
            return mockRequest;
          }),
          getResponse: jest.fn(function (this: void) {
            return mockResponse;
          }),
        };
      }),
    } as unknown as ExecutionContext;
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LoggingInterceptor,
        {
          provide: LoggerService,
          useValue: {
            info: jest.fn(),
          },
        },
      ],
    }).compile();

    interceptor = module.get<LoggingInterceptor>(LoggingInterceptor);
    loggerService = module.get(LoggerService);

    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  it('should be successfully defined', () => {
    expect(interceptor).toBeDefined();
  });

  it('should completely ignore execution chains that fall outside HTTP protocol scopes', (done) => {
    const context = createMockContext('rpc'); // e.g., microservice or web socket context types
    const callHandler: CallHandler = {
      handle: jest.fn(function (this: void) {
        return of('rpc-data');
      }),
    };
    const infoSpy = jest.spyOn(loggerService, 'info');

    interceptor.intercept(context, callHandler).subscribe({
      next: (val) => {
        expect(val).toBe('rpc-data');
        expect(jest.mocked(infoSpy)).not.toHaveBeenCalled();
        done();
      },
    });

    // ✅ Flush the fake timers microtask queue to force the subscription to execute
    jest.runOnlyPendingTimers();
  });

  it('should calculate operational response metrics and log details during successful resolutions', (done) => {
    const context = createMockContext('http');
    const callHandler: CallHandler = {
      handle: jest.fn(function (this: void) {
        // Fast forward 45ms during handler execution loop blocks
        jest.advanceTimersByTime(45);
        return of({ success: true });
      }),
    };

    interceptor.intercept(context, callHandler).subscribe({
      next: () => {
        const infoSpy = jest.spyOn(loggerService, 'info');
        expect(infoSpy).toHaveBeenCalledTimes(1);
        expect(infoSpy).toHaveBeenCalledWith(
          'POST /api/v1/auth/login 200 - 45ms',
          expect.objectContaining({
            method: 'POST',
            url: '/api/v1/auth/login',
            statusCode: 200,
            responseTimeMs: 45,
            ip: '127.0.0.1',
            userAgent: 'Jest-Test-Agent',
          }),
        );
        done();
      },
    });
  });

  it('should still record operational metrics correctly when downstream handler pipes encounter runtime errors', (done) => {
    const context = createMockContext('http');
    const mockError = new Error('Database connection timeout failure');

    const callHandler: CallHandler = {
      handle: jest.fn(function (this: void) {
        jest.advanceTimersByTime(120); // Fast forward 120ms
        return throwError(function (this: void) {
          return mockError;
        });
      }),
    };
    const infoSpy = jest.spyOn(loggerService, 'info');
    interceptor.intercept(context, callHandler).subscribe({
      error: (err) => {
        expect(err).toBe(mockError);
        expect(infoSpy).toHaveBeenCalledTimes(1);
        expect(infoSpy).toHaveBeenCalledWith(
          'POST /api/v1/auth/login 200 - 120ms',
          expect.objectContaining({
            method: 'POST',
            url: '/api/v1/auth/login',
            statusCode: 200,
            responseTimeMs: 120,
          }),
        );
        done();
      },
    });
  });
});
