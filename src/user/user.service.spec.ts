import { ConflictException, NotFoundException } from '@nestjs/common';
import { UserService } from './user.service';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordService } from '../auth/services/password.service';

const USER = {
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
    role: { findFirst: jest.Mock };
  };
  let password: jest.Mocked<Pick<PasswordService, 'hash'>>;

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue(USER),
        update: jest.fn().mockResolvedValue(USER),
      },
      role: { findFirst: jest.fn().mockResolvedValue(ROLE) },
    };
    password = { hash: jest.fn().mockResolvedValue('HASHED') };

    service = new UserService(
      prisma as unknown as PrismaService,
      password as unknown as PasswordService,
    );
  });

  afterEach(() => jest.clearAllMocks());

  describe('create', () => {
    const dto = {
      email: 'User@Example.com',
      password: 'pw',
      firstName: 'Test',
      lastName: 'User',
      role: 'user',
      avatarUrl: null,
    } as never;

    it('normalizes the email to lowercase before storing', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(null);
      await service.create(dto);

      const data = prisma.user.create.mock.calls[0][0].data;
      expect(data.email).toBe('user@example.com');
    });

    it('throws NotFoundException when the role does not exist', async () => {
      prisma.role.findFirst.mockResolvedValueOnce(null);
      await expect(service.create(dto)).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when the email is already registered', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(USER); // existing
      await expect(service.create(dto)).rejects.toThrow(ConflictException);
    });

    it('hashes the password and assigns the resolved role', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(null);
      await service.create(dto);

      expect(password.hash).toHaveBeenCalledWith('pw');
      const data = prisma.user.create.mock.calls[0][0].data;
      expect(data.passwordHash).toBe('HASHED');
      expect(data.roles).toEqual({ create: { roleId: 'role-1' } });
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

    it('filters out soft-deleted users', async () => {
      prisma.user.findFirst.mockResolvedValueOnce(USER);
      await service.findById('user-1');
      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: { id: 'user-1', deletedAt: null },
      });
    });
  });

  describe('markEmailVerified', () => {
    it('sets emailVerified true and status ACTIVE', async () => {
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
    it('includes the nested role→permission tree and filters soft-deleted', async () => {
      prisma.user.findFirst.mockResolvedValueOnce({ ...USER, roles: [] });
      await service.findByIdWithRoles('user-1');

      const arg = prisma.user.findFirst.mock.calls[0][0];
      expect(arg.where).toEqual({ id: 'user-1', deletedAt: null });
      expect(arg.include.roles.include.role.include.permissions.include.permission).toBe(true);
    });
  });

  describe('findAll', () => {
    it('filters soft-deleted users and omits password hashes', async () => {
      await service.findAll();

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { deletedAt: null },
        }),
      );
      const arg = prisma.user.findMany.mock.calls[0]?.[0] ?? {};
      const omitsHash =
        arg.omit?.passwordHash === true || (arg.select && arg.select.passwordHash !== true);
      expect(omitsHash).toBe(true);
    });
  });
});
