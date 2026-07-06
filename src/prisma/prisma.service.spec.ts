jest.mock('@prisma/adapter-pg', () => ({
  PrismaPg: jest.fn().mockImplementation(() => ({ adapterName: 'pg' })),
}));

jest.mock('@prisma/client', () => ({
  PrismaClient: class {
    $connect = jest.fn().mockResolvedValue(undefined);
    $disconnect = jest.fn().mockResolvedValue(undefined);
    constructor(_opts?: unknown) {}
  },
}));

import { ConfigService } from '@nestjs/config';
import { PrismaService } from './prisma.service';
import type { Env } from '../config/env.validation';

jest.mock('@prisma/adapter-pg', () => ({
  PrismaPg: jest.fn().mockImplementation(() => ({})),
}));

describe('PrismaService', () => {
  const config = {
    get: jest.fn(() => 'postgresql://user:pass@localhost:5432/db'),
  } as unknown as ConfigService<Env, true>;

  it('builds the pg adapter from DATABASE_URL', () => {
    const { PrismaPg } = jest.requireMock('@prisma/adapter-pg');
    new PrismaService(config);
    expect(PrismaPg).toHaveBeenCalledWith({
      connectionString: 'postgresql://user:pass@localhost:5432/db',
    });
  });

  it('connects on init and disconnects on destroy', async () => {
    const service = new PrismaService(config);
    const connect = jest.spyOn(service, '$connect').mockResolvedValue(undefined);
    const disconnect = jest.spyOn(service, '$disconnect').mockResolvedValue(undefined);

    await service.onModuleInit();
    await service.onModuleDestroy();

    expect(connect).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
  it('connects on init and disconnects on destroy', async () => {
    const service = new PrismaService(config);

    const connect = jest.spyOn(service, '$connect').mockResolvedValue(undefined);
    const disconnect = jest.spyOn(service, '$disconnect').mockResolvedValue(undefined);

    await service.onModuleInit();
    await service.onModuleDestroy(); // executes lines 17-18

    expect(connect).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
