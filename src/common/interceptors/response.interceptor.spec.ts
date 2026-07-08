import { Test, TestingModule } from '@nestjs/testing';
import { ResponseInterceptor } from './response.interceptor';
import { Reflector } from '@nestjs/core';
import { RequestContext } from '../context/request-context';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable, of } from 'rxjs';
import { RAW_RESPONSE_KEY } from '../decorators/raw-response.decorator';
import { ApiResponse } from '../response/api-response';
import type { Request, Response } from 'express';

describe('ResponseInterceptor', () => {
  let interceptor: ResponseInterceptor<unknown>;
  let reflector: jest.Mocked<Reflector>;
  let requestContext: jest.Mocked<RequestContext>;

  const mockRequest = {
    originalUrl: '/api/v1/users/profile',
  } as unknown as Request;

  const mockResponse = {
    statusCode: 200,
  } as unknown as Response;

  // Helper factory to quickly assemble context stubs satisfying linters
  function createMockContext(
    contextType: string = 'http',
    handler = {},
    controllerClass = {},
  ): ExecutionContext {
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
      getHandler: jest.fn(function (this: void) {
        return handler;
      }),
      getClass: jest.fn(function (this: void) {
        return controllerClass;
      }),
    } as unknown as ExecutionContext;
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResponseInterceptor,
        {
          provide: Reflector,
          useValue: {
            getAllAndOverride: jest.fn(function (this: void) {
              return false;
            }),
          },
        },
        {
          provide: RequestContext,
          useValue: {
            get: jest.fn(function (this: void, key: string) {
              if (key === 'requestId') return 'req-id-789-xyz';
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    interceptor = module.get<ResponseInterceptor<unknown>>(ResponseInterceptor);
    reflector = module.get(Reflector);
    requestContext = module.get(RequestContext);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be successfully defined', () => {
    expect(interceptor).toBeDefined();
  });

  it('should immediately pass through if context execution is not HTTP protocol scoped', (done) => {
    const context = createMockContext('graphql');
    const infoSpy = jest.spyOn(reflector, 'getAllAndOverride');

    const callHandler: CallHandler = {
      handle: jest.fn(function (this: void) {
        return of('unmodified-graphql-payload');
      }),
    };

    interceptor.intercept(context, callHandler).subscribe({
      next: (val) => {
        expect(val).toBe('unmodified-graphql-payload');
        expect(infoSpy).not.toHaveBeenCalled();
        done();
      },
    });
  });

  it('should completely bypass mapping envelopes if the route has the @RawResponse decorator metadata active', (done) => {
    const context = createMockContext('http');
    const infoSpy = jest.spyOn(reflector, 'getAllAndOverride');
    const requestSpy = jest.spyOn(requestContext, 'get');

    reflector.getAllAndOverride.mockReturnValueOnce(true); // Simulates raw-response active

    const callHandler: CallHandler = {
      handle: jest.fn(function (this: void) {
        return of('literal-string-buffer-data');
      }),
    };

    interceptor.intercept(context, callHandler).subscribe({
      next: (val) => {
        expect(val).toBe('literal-string-buffer-data');
        expect(infoSpy).toHaveBeenCalledWith(RAW_RESPONSE_KEY, [
          context.getHandler(),
          context.getClass(),
        ]);
        expect(requestSpy).not.toHaveBeenCalled();
        done();
      },
    });
  });

  it('should automatically wrap bare objects inside a success envelope and inject tracking metadata attributes', (done) => {
    const context = createMockContext('http');
    const rawPayload = { id: 'user-1', roles: ['admin'] };

    const callHandler: CallHandler = {
      handle: jest.fn(function (this: void) {
        return of(rawPayload);
      }),
    };

    const spySuccess = jest.spyOn(ApiResponse, 'success').mockReturnValue(
      Object.assign(Object.create(ApiResponse.prototype), {
        success: true,
        statusCode: 200,
        data: rawPayload,
      }) as ApiResponse<unknown>,
    );

    interceptor.intercept(context, callHandler).subscribe({
      next: (wrappedResult) => {
        expect(spySuccess).toHaveBeenCalledWith({ data: rawPayload, statusCode: 200 });
        expect(wrappedResult).toEqual(
          expect.objectContaining({
            success: true,
            statusCode: 200,
            data: rawPayload,
            path: '/api/v1/users/profile',
            requestId: 'req-id-789-xyz',
          }),
        );
        done();
      },
    });
  });

  it('should not recreate a new wrapper structure if the streaming payload is already an instance of ApiResponse', (done) => {
    const context = createMockContext('http');

    const preExistingEnvelope = Object.assign(Object.create(ApiResponse.prototype), {
      success: true,
      statusCode: 201,
      data: { created: true },
      path: '',
      requestId: '',
    });

    const callHandler: CallHandler = {
      handle: jest.fn(function (this: void) {
        return of(preExistingEnvelope);
      }),
    };

    const spySuccess = jest.spyOn(ApiResponse, 'success');

    const interceptStream = interceptor.intercept(context, callHandler) as Observable<
      ApiResponse<unknown>
    >;

    interceptStream.subscribe({
      next: (finalPayload) => {
        expect(spySuccess).not.toHaveBeenCalled();
        expect(finalPayload).toBe(preExistingEnvelope);
        expect(finalPayload.path).toBe('/api/v1/users/profile');
        expect(finalPayload.requestId).toBe('req-id-789-xyz');
        done();
      },
    });
  });
});
