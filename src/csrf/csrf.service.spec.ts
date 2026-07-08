import { Test, TestingModule } from '@nestjs/testing';
import { CsrfService } from './csrf.service';
import { ConfigService } from '@nestjs/config';
import { InternalServerErrorException } from '@nestjs/common';
import { doubleCsrf } from 'csrf-csrf';
import type { Request, Response } from 'express';

jest.mock('csrf-csrf');

describe('CsrfService', () => {
  const mockConfigStore: Record<string, string | boolean> = {
    CSRF_ENABLED: true,
    NODE_ENV: 'development',
    CSRF_SECRET: 'super-secure-secret-key-123456',
  };
  let mockDoubleCsrfResult: {
    generateCsrfToken: jest.Mock;
    validateRequest: jest.Mock;
  };

  beforeEach(() => {
    mockDoubleCsrfResult = {
      generateCsrfToken: jest.fn(function (this: void) {
        return 'mocked-token';
      }),
      validateRequest: jest.fn(function (this: void) {
        return true;
      }),
    };

    (doubleCsrf as jest.Mock).mockReturnValue(mockDoubleCsrfResult);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // Factory function to compile the service dynamically per test state
  async function createService(): Promise<CsrfService> {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CsrfService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(function (this: void, key: string) {
              return mockConfigStore[key];
            }),
          },
        },
      ],
    }).compile();

    return module.get<CsrfService>(CsrfService);
  }

  describe('When CSRF protection is enabled', () => {
    it('should initialize doubleCsrf with correct parameters and map methods', async () => {
      const service = await createService();

      expect(service.enabled).toBe(true);
      expect(doubleCsrf).toHaveBeenCalledTimes(1);

      // Verify mapped class methods resolve cleanly through the inner library mocks
      expect(service.generateToken({} as Request, {} as Response)).toBe('mocked-token');
      expect(service.validateRequest({} as Request)).toBe(true);

      // Verify doubleCsrf option initialization parameters
      const callArgs = (doubleCsrf as jest.Mock).mock.calls[0][0];
      expect(callArgs.cookieName).toBe('x-csrf-token');
      expect(callArgs.cookieOptions.secure).toBe(false); // because NODE_ENV !== production
      expect(callArgs.getSecret()).toBe('super-secure-secret-key-123456');
      expect(callArgs.getSessionIdentifier({ ip: '127.0.0.1' } as Request)).toBe('127.0.0.1');
      expect(callArgs.getSessionIdentifier({} as Request)).toBe('');
      expect(
        callArgs.getCsrfTokenFromRequest({
          headers: { 'x-csrf-token': 'token-value' },
        }),
      ).toBe('token-value');
    });

    it('should set secure cookie flag to true when running in production context environments', async () => {
      mockConfigStore.NODE_ENV = 'production';
      await createService();

      const callArgs = (doubleCsrf as jest.Mock).mock.calls[0][0];
      expect(callArgs.cookieOptions.secure).toBe(true);
    });

    it('should throw an InternalServerErrorException if CSRF_ENABLED is true but CSRF_SECRET is missing', async () => {
      delete mockConfigStore.CSRF_SECRET;

      await expect(createService()).rejects.toThrow(InternalServerErrorException);
      await expect(createService()).rejects.toThrow(
        'CSRF_ENABLED is true but CSRF_SECRET is not set',
      );
    });
  });

  describe('When CSRF protection is explicitly disabled', () => {
    beforeEach(() => {
      mockConfigStore.CSRF_ENABLED = false;
    });

    it('should short-circuit initialization and bypass doubleCsrf instantiation entirely', async () => {
      const service = await createService();

      expect(service.enabled).toBe(false);
      expect(doubleCsrf).not.toHaveBeenCalled();

      // Assert fallback baseline strategies match expected behaviors
      expect(service.generateToken({} as Request, {} as Response)).toBe('');
      expect(service.validateRequest({} as Request)).toBe(true);
    });
  });
});
