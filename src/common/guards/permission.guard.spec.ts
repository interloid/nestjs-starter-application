import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permission.guard';

function mockContext(user?: { permissions: string[] }): ExecutionContext {
  return {
    getHandler: jest.fn(() => 'handlerRef'),
    getClass: jest.fn(() => 'classRef'),
    switchToHttp: jest.fn(() => ({
      getRequest: jest.fn(() => ({ user })),
    })),
  } as unknown as ExecutionContext;
}

describe('PermissionsGuard', () => {
  let guard: PermissionsGuard;
  let reflector: jest.Mocked<Pick<Reflector, 'getAllAndOverride'>>;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() };
    guard = new PermissionsGuard(reflector as unknown as Reflector);
  });

  afterEach(() => jest.clearAllMocks());

  describe('routes without @RequirePermission', () => {
    it('passes when no permissions are required (undefined metadata)', () => {
      reflector.getAllAndOverride.mockReturnValueOnce(undefined);
      expect(guard.canActivate(mockContext({ permissions: [] }))).toBe(true);
    });

    it('passes when the required array is empty', () => {
      reflector.getAllAndOverride.mockReturnValueOnce([]);
      expect(guard.canActivate(mockContext({ permissions: [] }))).toBe(true);
    });
  });

  describe('authentication', () => {
    it('throws when a permission is required but no user is present', () => {
      reflector.getAllAndOverride.mockReturnValue(['users:read']); // no "Once" — persists
      const ctx = mockContext(undefined);

      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
      expect(() => guard.canActivate(mockContext(undefined))).toThrow('Not authenticated');
    });
  });

  describe('exact permission match', () => {
    it('passes when the user has the exact required permission', () => {
      reflector.getAllAndOverride.mockReturnValueOnce(['users:read']);
      const ctx = mockContext({ permissions: ['users:read'] });
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('throws when the user lacks the required permission', () => {
      reflector.getAllAndOverride.mockReturnValueOnce(['users:delete']);
      const ctx = mockContext({ permissions: ['users:read'] });
      expect(() => guard.canActivate(ctx)).toThrow('Insufficient permissions');
    });
  });

  describe('manage wildcard', () => {
    it('"users:manage" satisfies a required "users:update"', () => {
      reflector.getAllAndOverride.mockReturnValueOnce(['users:update']);
      const ctx = mockContext({ permissions: ['users:manage'] });
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('"users:manage" satisfies "users:read", "users:delete", etc.', () => {
      const ctx = (required: string) => {
        reflector.getAllAndOverride.mockReturnValueOnce([required]);
        return mockContext({ permissions: ['users:manage'] });
      };
      expect(guard.canActivate(ctx('users:read'))).toBe(true);
      expect(guard.canActivate(ctx('users:delete'))).toBe(true);
    });

    it('"users:manage" does NOT satisfy a DIFFERENT resource ("posts:update")', () => {
      reflector.getAllAndOverride.mockReturnValueOnce(['posts:update']);
      const ctx = mockContext({ permissions: ['users:manage'] });
      expect(() => guard.canActivate(ctx)).toThrow('Insufficient permissions');
    });

    it('a specific action does NOT satisfy a required "manage" (no UP expansion)', () => {
      reflector.getAllAndOverride.mockReturnValueOnce(['users:manage']);
      const ctx = mockContext({ permissions: ['users:update'] });
      expect(() => guard.canActivate(ctx)).toThrow('Insufficient permissions');
    });

    it('exact "users:manage" satisfies a required "users:manage"', () => {
      reflector.getAllAndOverride.mockReturnValueOnce(['users:manage']);
      const ctx = mockContext({ permissions: ['users:manage'] });
      expect(guard.canActivate(ctx)).toBe(true);
    });
  });

  describe('multiple required permissions (AND semantics)', () => {
    it('passes only when the user has ALL required permissions', () => {
      reflector.getAllAndOverride.mockReturnValueOnce(['users:read', 'users:update']);
      const ctx = mockContext({ permissions: ['users:read', 'users:update'] });
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('throws when the user has only SOME of the required permissions', () => {
      reflector.getAllAndOverride.mockReturnValueOnce(['users:read', 'users:delete']);
      const ctx = mockContext({ permissions: ['users:read'] }); // missing delete
      expect(() => guard.canActivate(ctx)).toThrow('Insufficient permissions');
    });

    it('"users:manage" satisfies MULTIPLE users:* requirements at once', () => {
      reflector.getAllAndOverride.mockReturnValueOnce([
        'users:read',
        'users:update',
        'users:delete',
      ]);
      const ctx = mockContext({ permissions: ['users:manage'] });
      expect(guard.canActivate(ctx)).toBe(true);
    });
  });
});
