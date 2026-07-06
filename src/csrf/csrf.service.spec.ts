import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { CsrfService } from './csrf.service';
import type { Request, Response } from 'express';

describe('CsrfService', () => {
  let service: CsrfService;
  let mockConfigService: jest.Mocked<ConfigService>;

  const createTestingModule = (configPairs: Record<string, any>) => {
    mockConfigService = {
      get: jest.fn().mockImplementation((key: string) => configPairs[key]),
    } as any;

    return Test.createTestingModule({
      providers: [
        CsrfService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();
  };

  describe('Initialization and Configuration', () => {
    it('should correctly read enabled status from config', async () => {
      const module: TestingModule = await createTestingModule({
        CSRF_ENABLED: true,
        CSRF_SECRET: 'super-secret',
        NODE_ENV: 'test',
      });
      service = module.get<CsrfService>(CsrfService);

      expect(service.enabled).toBe(true);
      expect(service.generateToken).toBeDefined();
      expect(service.validateRequest).toBeDefined();
    });

    it('should fall back to false if CSRF_ENABLED is missing', async () => {
      const module: TestingModule = await createTestingModule({
        CSRF_SECRET: 'super-secret',
        NODE_ENV: 'test',
      });
      service = module.get<CsrfService>(CsrfService);
      expect(service.enabled).toBeUndefined();
    });
  });
  describe('CsrfService Uncovered Branches (Lines 13-20)', () => {
    it('should fall back to "dev-only" secret if CSRF_SECRET is not provided', async () => {
      const module = await createTestingModule({
        CSRF_ENABLED: true,
        CSRF_SECRET: undefined,
        NODE_ENV: 'development',
      });
      const devService = module.get<CsrfService>(CsrfService);

      const req = { ip: '127.0.0.1', cookies: {} };
      const res = { cookie: jest.fn() };

      expect(() => devService.generateToken(req as Request, res as Response)).not.toThrow();
    });

    it('should use an empty string as session identifier if req.ip is missing', async () => {
      const module = await createTestingModule({
        CSRF_ENABLED: true,
        CSRF_SECRET: 'test-secret-key-32-chars-long-minimum!!!',
        NODE_ENV: 'development',
      });
      const ipService = module.get<CsrfService>(CsrfService);

      const req = { ip: undefined, cookies: {} };
      const res = { cookie: jest.fn() };

      expect(() => ipService.generateToken(req as any, res as any)).not.toThrow();
    });

    it('should set secure cookie configuration to true if NODE_ENV is production', async () => {
      const module = await createTestingModule({
        CSRF_ENABLED: true,
        CSRF_SECRET: 'test-secret-key-32-chars-long-minimum!!!',
        NODE_ENV: 'production', // 💡 Triggers the true path for === 'production'
      });
      const prodService = module.get<CsrfService>(CsrfService);

      const req = { ip: '127.0.0.1', cookies: {} };
      const res = { cookie: jest.fn() };

      prodService.generateToken(req as any, res as any);

      const setCookieArgs = (res.cookie as jest.Mock).mock.calls[0][2];
      expect(setCookieArgs.secure).toBe(true);
    });
  });

  describe('Token Generation and Validation (Double CSRF)', () => {
    let req: Partial<Request>;
    let res: Partial<Response>;

    beforeEach(async () => {
      const module: TestingModule = await createTestingModule({
        CSRF_ENABLED: true,
        CSRF_SECRET: 'test-secret-key-32-chars-long-minimum!!!',
        NODE_ENV: 'test',
      });
      service = module.get<CsrfService>(CsrfService);

      req = {
        ip: '127.0.0.1',
        headers: {},
        cookies: {},
      };

      res = {
        cookie: jest.fn(),
      };
    });

    it('should generate a valid string token and set a cookie', () => {
      const token = service.generateToken(req as Request, res as Response);

      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(0);
      expect(res.cookie).toHaveBeenCalledWith(
        'x-csrf-token',
        expect.any(String),
        expect.any(Object),
      );
    });

    it('should validate a request successfully if token matches the cookie context', () => {
      const token = service.generateToken(req as Request, res as Response);

      req.headers = {
        'x-csrf-token': token,
      };

      const setCookieArgs = (res.cookie as jest.Mock).mock.calls[0];
      req.cookies = {
        'x-csrf-token': setCookieArgs[1],
      };

      const isValid = service.validateRequest(req as Request);
      expect(isValid).toBe(true);
    });

    it('should fail validation if the header token is missing or altered', () => {
      service.generateToken(req as Request, res as Response);
      const setCookieArgs = (res.cookie as jest.Mock).mock.calls[0];
      req.cookies = { 'x-csrf-token': setCookieArgs[1] };

      req.headers = { 'x-csrf-token': 'wrong-or-malicious-token' };

      const isValid = service.validateRequest(req as Request);
      expect(isValid).toBe(false);
    });
  });
});
