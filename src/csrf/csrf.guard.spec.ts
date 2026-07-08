import { Test, TestingModule } from '@nestjs/testing';
import { CsrfGuard } from './csrf.guard';
import { Reflector } from '@nestjs/core';
import { CsrfService } from './csrf.service';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { SKIP_CSRF_KEY } from '../common/decorators/skip-csrf.decorator';

describe('CsrfGuard', () => {
  let guard: CsrfGuard;
  let reflector: jest.Mocked<Reflector>;
  let csrfService: jest.Mocked<CsrfService>;

  function createMockContext(method: string, handler = {}, controllerClass = {}): ExecutionContext {
    return {
      switchToHttp: jest.fn(function (this: void) {
        return {
          getRequest: jest.fn(function (this: void) {
            return { method };
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
        CsrfGuard,
        {
          provide: Reflector,
          useValue: {
            getAllAndOverride: jest.fn(function (this: void) {
              return false;
            }),
          },
        },
        {
          provide: CsrfService,
          useValue: {
            enabled: true,
            validateRequest: jest.fn(function (this: void) {
              return true;
            }),
          },
        },
      ],
    }).compile();

    guard = module.get<CsrfGuard>(CsrfGuard);
    reflector = module.get(Reflector);

    csrfService = module.get(CsrfService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be successfully defined', () => {
    expect(guard).toBeDefined();
  });

  it('should instantly allow activation if the global CSRF engine service is disabled', () => {
    (csrfService as { enabled: boolean }).enabled = false;
    const context = createMockContext('POST');

    expect(guard.canActivate(context)).toBe(true);
    expect(csrfService.validateRequest).not.toHaveBeenCalled();
  });

  type SafeMethod = 'GET' | 'HEAD' | 'OPTIONS';
  const safeMethods: SafeMethod[] = ['GET', 'HEAD', 'OPTIONS'];
  safeMethods.forEach((method) => {
    it(`should completely bypass token checks for safe HTTP method: ${method}`, () => {
      const context = createMockContext(method);
      const infoSpy = jest.spyOn(reflector, 'getAllAndOverride');

      expect(guard.canActivate(context)).toBe(true);
      expect(infoSpy).not.toHaveBeenCalled();
      expect(csrfService.validateRequest).not.toHaveBeenCalled();
    });
  });

  describe('When processing unsafe mutating HTTP request actions (e.g., POST, PUT, DELETE)', () => {
    it('should allow access if the target route is decorated with the SkipCsrf metadata decorator key', () => {
      const context = createMockContext('POST');
      const infoSpy = jest.spyOn(reflector, 'getAllAndOverride');

      reflector.getAllAndOverride.mockReturnValueOnce(true);

      expect(guard.canActivate(context)).toBe(true);
      expect(infoSpy).toHaveBeenCalledWith(SKIP_CSRF_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
      expect(csrfService.validateRequest).not.toHaveBeenCalled();
    });

    it('should allow access if verification passes successfully against valid incoming request parameters', () => {
      const context = createMockContext('POST');
      reflector.getAllAndOverride.mockReturnValueOnce(false);
      csrfService.validateRequest.mockReturnValueOnce(true);

      expect(guard.canActivate(context)).toBe(true);
      expect(csrfService.validateRequest).toHaveBeenCalledTimes(1);
    });

    it('should throw a ForbiddenException if validation fails against an invalid or missing token footprint', () => {
      const context = createMockContext('POST');
      reflector.getAllAndOverride.mockReturnValueOnce(false);

      csrfService.validateRequest.mockReturnValue(false);

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      expect(() => guard.canActivate(context)).toThrow('Invalid CSRF token');
    });
  });
});
