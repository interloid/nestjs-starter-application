import { ConflictException, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { UserService } from './user.service';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordService } from '../common/crypto/password.service';
import { RegisterDto } from '../auth/dto/auth.dto';
import { User } from '@prisma/client';

const USER: User = {
  id: 'user-1',
  email: 'user@example.com',
  emailVerified: false,
  passwordHash: 'HASHED',
  firstName: 'Test',
  lastName: null,
  avatarUrl: null,
  status: true,
  lastLoginAt: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  deletedAt: null,
};
const ROLE = { id: 'role-1', name: 'user' };

describe('UserService', () => {
  let service: UserService;
  let prisma: {
    user: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    role: { findUnique: jest.Mock };
    userRole: { upsert: jest.Mock };
  };
  let password: jest.Mocked<Pick<PasswordService, 'hash'>>;

  beforeEach(() => {
    // Satisfies linter by defining functions explicitly with safe return stubs
    prisma = {
      user: {
        findUnique: jest.fn(function (this: void) {
          return Promise.resolve(null);
        }),
        findFirst: jest.fn(function (this: void) {
          return Promise.resolve(null);
        }),
        findMany: jest.fn(function (this: void) {
          return Promise.resolve([]);
        }),
        create: jest.fn(function (this: void) {
          return Promise.resolve(USER);
        }),
        update: jest.fn(function (this: void) {
          return Promise.resolve(USER);
        }),
      },
      role: {
        findUnique: jest.fn(function (this: void) {
          return Promise.resolve(ROLE);
        }),
      },
      userRole: {
        upsert: jest.fn(function (this: void) {
          return Promise.resolve({});
        }),
      },
    };
    password = {
      hash: jest.fn(function (this: void) {
        return Promise.resolve('HASHED');
      }),
    };

    service = new UserService(
      prisma as unknown as PrismaService,
      password as unknown as PasswordService,
    );
  });

  afterEach(() => jest.clearAllMocks());

  describe('create', () => {
    const dto: RegisterDto = {
      email: 'User@Example.com',
      password: 'pw',
      firstName: 'Test',
      lastName: 'User',
      avatarUrl: null,
    };

    it('normalizes the email to lowercase before storing', async () => {
      await service.create(dto);

      const arg = prisma.user.create.mock.calls[0][0];
      expect(arg.data.email).toBe('user@example.com');
    });

    it('throws InternalServerErrorException when the default role does not exist', async () => {
      prisma.role.findUnique.mockResolvedValueOnce(null);
      await expect(service.create(dto)).rejects.toThrow(InternalServerErrorException);
    });

    it('throws ConflictException when the email is already registered', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(USER);
      await expect(service.create(dto)).rejects.toThrow(ConflictException);
    });

    it('hashes the password and assigns the resolved role relational tree', async () => {
      await service.create(dto);

      expect(password.hash).toHaveBeenCalledWith('pw');
      const arg = prisma.user.create.mock.calls[0][0];
      expect(arg.data.passwordHash).toBe('HASHED');
      expect(arg.data.roles).toEqual({ create: { roleId: 'role-1' } });
    });
  });

  describe('findByEmailWithPassword', () => {
    it('normalizes email and filters out soft-deleted users', async () => {
      prisma.user.findFirst.mockResolvedValueOnce(USER);
      await service.findByEmailWithPassword('  User@Example.com  ');

      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: { email: 'user@example.com', deletedAt: null },
      });
    });
  });

  describe('findById', () => {
    it('returns the user when found', async () => {
      prisma.user.findFirst.mockResolvedValueOnce(USER);
      await expect(service.findById('user-1')).resolves.toEqual(USER);
    });

    it('throws NotFoundException when the user is missing', async () => {
      prisma.user.findFirst.mockResolvedValueOnce(null);
      await expect(service.findById('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('markEmailVerified', () => {
    it('sets emailVerified true and status true', async () => {
      await service.markEmailVerified('user-1');
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { emailVerified: true, status: true },
      });
    });
  });

  describe('updateLastLogin', () => {
    it('sets lastLoginAt to a Date', async () => {
      await service.updateLastLogin('user-1');
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { lastLoginAt: expect.any(Date) },
      });
    });
  });

  describe('updatePassword', () => {
    it('updates the password hash', async () => {
      await service.updatePassword('user-1', 'NEW-HASH');
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { passwordHash: 'NEW-HASH' },
      });
    });
  });

  describe('findByIdWithRoles', () => {
    it('includes the deep nested role→permission mapping tree structures', async () => {
      prisma.user.findFirst.mockResolvedValueOnce({ ...USER, roles: [] });
      await service.findByIdWithRoles('user-1');

      const arg = prisma.user.findFirst.mock.calls[0][0];
      expect(arg.where).toEqual({ id: 'user-1', deletedAt: null });
      expect(arg.include.roles.include.role.include.permissions.include.permission).toBe(true);
    });
  });

  describe('findAll', () => {
    it('filters out soft-deleted users and strictly omits password hashes', async () => {
      await service.findAll();

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: { deletedAt: null },
        omit: { passwordHash: true },
      });
    });
  });

  describe('assignRole', () => {
    const userId = 'user-1';
    const targetRoleName = 'admin';
    const mockRolePayload = { id: 'role-admin-id', name: 'admin' };

    it('successfully updates or creates permissions using the composite userRole identifier', async () => {
      prisma.user.findFirst.mockResolvedValueOnce(USER);
      prisma.role.findUnique.mockResolvedValueOnce(mockRolePayload);

      const spyFindByIdWithRoles = jest
        .spyOn(service, 'findByIdWithRoles')
        .mockResolvedValueOnce({ ...USER, id: userId });

      const result = await service.assignRole(userId, targetRoleName);

      expect(prisma.userRole.upsert).toHaveBeenCalledWith({
        where: {
          userId_roleId: {
            userId: userId,
            roleId: mockRolePayload.id,
          },
        },
        update: {},
        create: {
          userId: userId,
          roleId: mockRolePayload.id,
        },
      });
      expect(spyFindByIdWithRoles).toHaveBeenCalledWith(userId);
      expect(result?.id).toBe(userId);
    });

    it('throws NotFoundException if target user structure is soft-deleted or missing', async () => {
      prisma.user.findFirst.mockResolvedValueOnce(null);
      await expect(service.assignRole(userId, targetRoleName)).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException if the requested assignment role does not exist inside the definitions', async () => {
      prisma.user.findFirst.mockResolvedValueOnce(USER);
      prisma.role.findUnique.mockResolvedValueOnce(null);
      await expect(service.assignRole(userId, targetRoleName)).rejects.toThrow(NotFoundException);
    });
  });
});
