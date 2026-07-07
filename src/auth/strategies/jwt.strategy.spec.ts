import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';
import { UserService } from '../../user/user.service';
import type { Env } from '../../config/env.validation';
import type { JwtPayload } from '../services/token.service';

function userWithRoles(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    email: 'user@example.com',
    status: 'ACTIVE',
    deletedAt: null,
    roles: [
      {
        role: {
          name: 'admin',
          permissions: [
            { permission: { name: 'users:read' } },
            { permission: { name: 'users:update' } },
          ],
        },
      },
      {
        role: {
          name: 'editor',
          permissions: [{ permission: { name: 'posts:update' } }],
        },
      },
    ],
    ...overrides,
  };
}

const PAYLOAD: JwtPayload = { sub: 'user-1', email: 'user@example.com' };

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let users: jest.Mocked<Pick<UserService, 'findByIdWithRoles'>>;

  beforeEach(() => {
    const config = {
      get: jest.fn(() => 'access-secret'),
    } as unknown as ConfigService<Env, true>;

    users = {
      findByIdWithRoles: jest.fn(),
    };

    strategy = new JwtStrategy(config, users as unknown as UserService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('validate — valid user', () => {
    it('loads the user by payload.sub with roles', async () => {
      users.findByIdWithRoles.mockResolvedValueOnce(userWithRoles());

      await strategy.validate(PAYLOAD);

      expect(users.findByIdWithRoles).toHaveBeenCalledWith('user-1');
    });

    it('flattens roles and permissions onto the returned user', async () => {
      users.findByIdWithRoles.mockResolvedValueOnce(userWithRoles());

      const result = await strategy.validate(PAYLOAD);

      expect(result).toEqual({
        id: 'user-1',
        email: 'user@example.com',
        status: 'ACTIVE',
        roles: ['admin', 'editor'],
        permissions: ['users:read', 'users:update', 'posts:update'],
      });
    });

    it('returns empty roles/permissions when the user has no roles', async () => {
      users.findByIdWithRoles.mockResolvedValueOnce(userWithRoles({ roles: [] }));

      const result = await strategy.validate(PAYLOAD);

      expect(result.roles).toEqual([]);
      expect(result.permissions).toEqual([]);
    });
  });

  describe('validate — rejections', () => {
    it('throws when the user is not found', async () => {
      users.findByIdWithRoles.mockResolvedValueOnce(null);

      await expect(strategy.validate(PAYLOAD)).rejects.toThrow(UnauthorizedException);
    });

    it('throws when the user is soft-deleted', async () => {
      users.findByIdWithRoles.mockResolvedValueOnce(userWithRoles({ deletedAt: new Date() }));

      await expect(strategy.validate(PAYLOAD)).rejects.toThrow(UnauthorizedException);
    });

    it('throws when the user is suspended (status false)', async () => {
      users.findByIdWithRoles.mockResolvedValueOnce(
        userWithRoles({ status: false }), // ← boolean false, not 'SUSPENDED'
      );

      await expect(strategy.validate(PAYLOAD)).rejects.toThrow(UnauthorizedException);
    });
  });
});
