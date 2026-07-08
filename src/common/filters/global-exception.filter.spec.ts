import { Test, TestingModule } from '@nestjs/testing';
import { GlobalExceptionFilter } from './global-exception.filter';
import { RequestContext } from '../context/request-context';
import { LoggerService } from '../../logger/logger.service';
import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { ZodValidationException } from 'nestjs-zod';
import { ZodError, ZodIssue } from 'zod';
import type { Request } from 'express';

describe('GlobalExceptionFilter', () => {
  let filter: GlobalExceptionFilter;
  let loggerService: jest.Mocked<LoggerService>;

  const mockRequest = {
    originalUrl: '/api/v1/resource',
  } as unknown as Request;

  let mockResponse: {
    status: jest.Mock;
    json: jest.Mock;
  };

  // Helper factory to assemble a mocked ArgumentsHost pipeline context
  function createMockArgumentsHost(): ArgumentsHost {
    mockResponse = {
      status: jest.fn(function (this: void) {
        return mockResponse;
      }),
      json: jest.fn(function (this: void) {
        return mockResponse;
      }),
    };

    return {
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
    } as unknown as ArgumentsHost;
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GlobalExceptionFilter,
        {
          provide: RequestContext,
          useValue: {
            get: jest.fn(function (this: void, key: string) {
              if (key === 'requestId') return 'req-id-abc-123';
              return undefined;
            }),
          },
        },
        {
          provide: LoggerService,
          useValue: {
            error: jest.fn(),
            warn: jest.fn(),
          },
        },
      ],
    }).compile();

    filter = module.get<GlobalExceptionFilter>(GlobalExceptionFilter);
    loggerService = module.get(LoggerService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be successfully defined', () => {
    expect(filter).toBeDefined();
  });

  describe('Exception Normalization Mechanics', () => {
    it('should intercept a ZodValidationException, format inner issues arrays, and log a warning', () => {
      const host = createMockArgumentsHost();

      const mockZodIssues: ZodIssue[] = [
        {
          code: 'invalid_type',
          expected: 'string',
          path: ['body', 'email'],
          message: 'Email must be a string',
        },
      ];
      const mockZodError = { issues: mockZodIssues } as ZodError;
      const exception = new ZodValidationException(mockZodError);
      const infoSpy = jest.spyOn(loggerService, 'warn');

      filter.catch(exception, host);

      expect(infoSpy).toHaveBeenCalledWith('Validation failed', { statusCode: 400 });
      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Validation failed',
          path: '/api/v1/resource',
          requestId: 'req-id-abc-123',
          errors: [
            { field: 'body.email', message: 'Email must be a string', code: 'invalid_type' },
          ],
        }),
      );
    });

    it('should catch an HttpException with an array message and format it into separate error elements', () => {
      const host = createMockArgumentsHost();
      const infoSpy = jest.spyOn(loggerService, 'warn');

      const exception = new HttpException(
        { message: ['username is too short', 'password is too weak'] },
        HttpStatus.BAD_REQUEST,
      );

      filter.catch(exception, host);

      expect(infoSpy).toHaveBeenCalledWith('Request failed', { statusCode: 400 });
      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Request failed',
          errors: [{ message: 'username is too short' }, { message: 'password is too weak' }],
        }),
      );
    });

    it('should map flat string payloads properly when catching an HttpException with a string message', () => {
      const host = createMockArgumentsHost();
      const infoSpy = jest.spyOn(loggerService, 'warn');

      const exception = new HttpException(
        'Resource is completely unavailable',
        HttpStatus.NOT_FOUND,
      );

      filter.catch(exception, host);

      expect(infoSpy).toHaveBeenCalledWith('Resource is completely unavailable', {
        statusCode: 404,
      });
      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Resource is completely unavailable',
        }),
      );
    });

    it('should fallback to an Internal Server Error and execute an error log log trace on uncaught raw system exceptions', () => {
      const host = createMockArgumentsHost();
      const infoSpy = jest.spyOn(loggerService, 'error');

      const rawError = new Error('Database cluster node dropped connectivity');

      filter.catch(rawError, host);

      expect(infoSpy).toHaveBeenCalledWith('Internal server error', rawError);
      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Internal server error',
        }),
      );
    });
  });
});
