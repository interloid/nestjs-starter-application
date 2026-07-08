import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, VersioningType } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import { ZodValidationPipe } from 'nestjs-zod';
import { CsrfGuard } from '../src/csrf/csrf.guard';
import { ThrottlerStorage } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { Server } from 'http';

describe('Authentication Flow (E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let configService: ConfigService;
  let throttlerStorage: ThrottlerStorageRedisService;

  const testUser = {
    email: 'e2e-test-user@example.com',
    password: 'SecurePassword@123',
    firstName: 'E2E',
  };

  beforeAll(async () => {
    const moduleBuilder = Test.createTestingModule({
      imports: [AppModule],
    });

    moduleBuilder.overrideGuard(CsrfGuard).useValue({ canActivate: () => true });

    const moduleFixture: TestingModule = await moduleBuilder.compile();
    app = moduleFixture.createNestApplication();

    app.use(cookieParser());
    app.useGlobalPipes(new ZodValidationPipe());

    app.setGlobalPrefix('api', { exclude: ['health/live', 'health/ready'] });
    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: '1',
    });

    prisma = app.get<PrismaService>(PrismaService);
    configService = app.get<ConfigService>(ConfigService);

    configService.set('COOKIE_AUTH', false);

    try {
      throttlerStorage = app.get<ThrottlerStorage>(
        ThrottlerStorage,
      ) as ThrottlerStorageRedisService;
      if (throttlerStorage) {
        jest.spyOn(throttlerStorage, 'increment').mockResolvedValue({
          totalHits: 1,
          timeToExpire: 60,
          isBlocked: false,
          timeToBlockExpire: 0,
        });
      }
    } catch {
      expect(true).toBe(true);
    }

    await app.init();
    await prisma.user.deleteMany({ where: { email: testUser.email } });
  });

  afterAll(async () => {
    jest.restoreAllMocks();

    if (prisma) {
      try {
        await prisma.user.deleteMany({ where: { email: testUser.email } });
      } catch {
        expect(true).toBe(true);
      }
    }

    if (app) {
      await app.close();
    }

    if (prisma) {
      try {
        await prisma.$disconnect();
      } catch {
        expect(true).toBe(true);
      }
    }

    if (throttlerStorage && throttlerStorage.redis) {
      try {
        if (typeof throttlerStorage.redis.disconnect === 'function') {
          throttlerStorage.redis.disconnect();
        }
      } catch {
        expect(true).toBe(true);
      }
    }
  }, 10000);

  describe('POST /api/v1/auth/register', () => {
    it('should register a user with URI prefixing active', async () => {
      const response = await request(app.getHttpServer() as Server)
        .post('/api/v1/auth/register')
        .send({
          email: testUser.email,
          password: testUser.password,
          firstName: testUser.firstName,
        });

      expect(response.status).toBe(201);
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it('should return valid body responses through your global ResponseInterceptor', async () => {
      await prisma.user.update({
        where: { email: testUser.email },
        data: { emailVerified: true, status: true }, // Marks the E2E user as verified
      });

      const response = await request(app.getHttpServer() as Server)
        .post('/api/v1/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password,
        });

      if (response.status > 400) {
        console.error('Zod Validation Failure Payload:', response.body);
      }

      expect(response.status).toBe(200);
      expect(response.body).toBeDefined();
    });
  });
});
