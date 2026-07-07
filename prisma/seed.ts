import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import argon2 from 'argon2'; // Standard default import for modern argon2 versions
import 'dotenv/config';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const PERMISSIONS = [
  { resource: 'users', action: 'read' },
  { resource: 'users', action: 'create' },
  { resource: 'users', action: 'update' },
  { resource: 'users', action: 'delete' },
  { resource: 'users', action: 'manage' },
  { resource: 'roles', action: 'read' },
  { resource: 'roles', action: 'manage' },
  { resource: 'permissions', action: 'read' },
];

async function main() {
  // 1. Permissions
  const permissions = await Promise.all(
    PERMISSIONS.map((p) =>
      prisma.permission.upsert({
        where: { resource_action: { resource: p.resource, action: p.action } },
        update: {},
        create: { name: `${p.resource}:${p.action}`, resource: p.resource, action: p.action },
      }),
    ),
  );

  // 2. Roles
  const superAdmin = await prisma.role.upsert({
    where: { name: 'super-admin' },
    update: {},
    create: { name: 'super-admin', description: 'Full access', isSystem: true },
  });
  const admin = await prisma.role.upsert({
    where: { name: 'admin' },
    update: {},
    create: { name: 'admin', description: 'Administrative access', isSystem: true },
  });
  const user = await prisma.role.upsert({
    where: { name: 'user' },
    update: {},
    create: { name: 'user', description: 'Standard user', isSystem: true },
  });

  await Promise.all(
    permissions.map((perm) =>
      prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: superAdmin.id, permissionId: perm.id } },
        update: {},
        create: { roleId: superAdmin.id, permissionId: perm.id },
      }),
    ),
  );
  const usersManagePerm = permissions.find((p) => p.name === 'users:manage');

  if (usersManagePerm) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: { roleId: admin.id, permissionId: usersManagePerm.id },
      },
      update: {},
      create: { roleId: admin.id, permissionId: usersManagePerm.id },
    });
    console.log(`Assigned 'users:manage' to the Admin role.`);
  }

  const adminEmail = 'admin@example.com';
  const passwordHash = await argon2.hash('Admin@123');
  const adminUser = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      passwordHash,
      emailVerified: true,
      status: true,
      firstName: 'Admin',
    },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: adminUser.id, roleId: superAdmin.id } },
    update: {},
    create: { userId: adminUser.id, roleId: superAdmin.id },
  });

  console.log('Seed complete. Admin:', adminEmail, '/ ChangeMe123!');
}

main()
  .catch((e: unknown) => {
    if (e instanceof Error) {
      console.error(e.message);
    } else {
      console.error('An unknown error occurred during seeding:', e);
    }
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
