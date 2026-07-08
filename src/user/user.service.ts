import {
  Injectable,
  ConflictException,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordService } from '../common/crypto/password.service';
import { RegisterDto } from '../auth/dto/auth.dto';

@Injectable()
export class UserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly password: PasswordService,
  ) {}

  async create(data: RegisterDto): Promise<User> {
    const email = data.email.toLowerCase().trim();

    const role = await this.prisma.role.findUnique({ where: { name: 'user' } });
    if (!role) {
      throw new InternalServerErrorException('Default role missing — run the seed');
    }
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await this.password.hash(data.password);

    return this.prisma.user.create({
      data: {
        email,
        passwordHash,
        firstName: data.firstName,
        avatarUrl: data.avatarUrl,
        lastName: data.lastName,
        roles: { create: { roleId: role.id } },
      },
    });
  }

  findByEmailWithPassword(email: string): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: { email: email.toLowerCase().trim(), deletedAt: null },
    });
  }

  async findById(id: string): Promise<User> {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  markEmailVerified(id: string) {
    return this.prisma.user.update({
      where: { id },
      data: { emailVerified: true, status: true },
    });
  }

  // Roles + permissions, for the JWT payload and RBAC checks
  findByIdWithRoles(id: string) {
    return this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      include: {
        roles: {
          include: {
            role: {
              include: {
                permissions: { include: { permission: true } },
              },
            },
          },
        },
      },
    });
  }

  updateLastLogin(id: string): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data: { lastLoginAt: new Date() },
    });
  }

  updatePassword(id: string, passwordHash: string) {
    return this.prisma.user.update({ where: { id }, data: { passwordHash } });
  }

  findAll() {
    return this.prisma.user.findMany({
      where: { deletedAt: null },
      omit: { passwordHash: true },
    });
  }
  async assignRole(id: string, role: string) {
    const user = await this.prisma.user.findFirst({ where: { id, deletedAt: null } });
    if (!user) throw new NotFoundException('User not found');

    const existingRole = await this.prisma.role.findUnique({ where: { name: role } });
    if (!existingRole) {
      throw new NotFoundException('Role not found');
    }
    await this.prisma.userRole.upsert({
      where: {
        userId_roleId: {
          userId: id,
          roleId: existingRole.id,
        },
      },
      update: {},
      create: {
        userId: id,
        roleId: existingRole.id,
      },
    });
    return this.findByIdWithRoles(id);
  }
}
