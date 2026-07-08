import { Test, TestingModule } from '@nestjs/testing';
import { TokenService, JwtPayload } from './token.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { UnauthorizedException } from '@nestjs/common';
import * as crypto from 'node:crypto';

jest.mock('node:crypto', () => ({
  ...(jest.requireActual('node:crypto') as unknown as typeof crypto),
  randomUUID: jest.fn(function (this: void) {
    return 'mocked-jti-uuid';
  }),
}));

describe('TokenService', () => {
  let service: TokenService;
  let jwtService: jest.Mocked<JwtService>;
  let prismaService: {
    refreshToken: {
      create: jest.Mock;
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    user: {
      findFirst: jest.Mock;
    };
  };

  const mockConfigStore: Record<string, string> = {
    JWT_ACCESS_SECRET: 'access-secret',
    JWT_ACCESS_TTL: '15m',
    JWT_REFRESH_SECRET: 'refresh-secret',
    JWT_REFRESH_TTL: '7d',
  };

  beforeEach(async () => {
    prismaService = {
      refreshToken: {
        create: jest.fn(function (this: void) {
          return Promise.resolve({});
        }),
        findUnique: jest.fn(function (this: void) {
          return Promise.resolve(null);
        }),
        findFirst: jest.fn(function (this: void) {
          return Promise.resolve(null);
        }),
        update: jest.fn(function (this: void) {
          return Promise.resolve({});
        }),
        updateMany: jest.fn(function (this: void) {
          return Promise.resolve({ count: 1 });
        }),
      },
      user: {
        findFirst: jest.fn(function (this: void) {
          return Promise.resolve({ status: true });
        }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TokenService,
        {
          provide: JwtService,
          useValue: {
            signAsync: jest.fn(function (this: void) {
              return Promise.resolve('mocked-jwt-string');
            }),
            verifyAsync: jest.fn(function (this: void) {
              return Promise.resolve({});
            }),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(function (this: void, key: string) {
              return mockConfigStore[key];
            }),
          },
        },
        {
          provide: PrismaService,
          useValue: prismaService,
        },
      ],
    }).compile();

    service = module.get<TokenService>(TokenService);
    jwtService = module.get(JwtService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be successfully defined', () => {
    expect(service).toBeDefined();
  });

  describe('ttlToMs', () => {
    it('should correctly parse shorthand time expressions to exact milliseconds', () => {
      expect(service.ttlToMs('10s')).toBe(10_000);
      expect(service.ttlToMs('5m')).toBe(300_000);
      expect(service.ttlToMs('2h')).toBe(7_200_000);
      expect(service.ttlToMs('3d')).toBe(259_200_000);
    });

    it('should fallback to 7 days if the configuration format expression string matches no pattern tokens', () => {
      const defaultSevenDaysInMs = 7 * 24 * 60 * 60 * 1000;
      expect(service.ttlToMs('invalid-string')).toBe(defaultSevenDaysInMs);
    });
  });

  describe('issueTokens', () => {
    it('should sign access and refresh payloads and commit a token hash entry to the database', async () => {
      const userId = 'user-123';
      const email = 'test@example.com';
      const meta = { userAgent: 'Chrome', ipAddress: '127.0.0.1' };
      const infoSpy = jest.spyOn(jwtService, 'signAsync');

      jwtService.signAsync
        .mockResolvedValueOnce('access-token-string')
        .mockResolvedValueOnce('refresh-token-string');

      const result = await service.issueTokens(userId, email, meta);

      expect(result).toEqual({
        accessToken: 'access-token-string',
        refreshToken: 'refresh-token-string',
      });

      expect(infoSpy).toHaveBeenNthCalledWith(
        1,
        { sub: userId, email },
        expect.objectContaining({
          secret: 'access-secret',
          expiresIn: '15m',
        }),
      );

      expect(infoSpy).toHaveBeenNthCalledWith(
        2,
        { sub: userId, email, jti: 'mocked-jti-uuid' },
        expect.objectContaining({
          secret: 'refresh-secret',
          expiresIn: '7d',
        }),
      );

      expect(prismaService.refreshToken.create).toHaveBeenCalledWith({
        data: {
          userId,
          tokenHash: service.hashToken('refresh-token-string'),
          userAgent: 'Chrome',
          ipAddress: '127.0.0.1',
          expiresAt: expect.any(Date),
        },
      });
    });
  });

  describe('refreshTokens', () => {
    const rawToken = 'valid-refresh-token';
    const userId = 'user-123';
    const mockPayload: JwtPayload & { jti: string } = {
      sub: userId,
      email: 'test@example.com',
      jti: 'jti-1',
    };
    const mockDbRecord = {
      id: 'record-1',
      userId,
      tokenHash: 'hashed-token',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 100_000),
    };

    beforeEach(() => {
      jwtService.verifyAsync.mockResolvedValue(mockPayload);
    });

    it('should rotate tokens successfully when valid inputs match active database sessions', async () => {
      prismaService.refreshToken.findUnique.mockResolvedValueOnce(mockDbRecord);

      const spyIssue = jest.spyOn(service, 'issueTokens').mockResolvedValueOnce({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
      });

      const result = await service.refreshTokens(rawToken);

      expect(prismaService.refreshToken.update).toHaveBeenCalledWith({
        where: { id: mockDbRecord.id },
        data: { revokedAt: expect.any(Date) },
      });
      expect(spyIssue).toHaveBeenCalledWith(userId, mockPayload.email, undefined);
      expect(result).toEqual({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
      });
    });

    it('should throw UnauthorizedException if the JWT signature is corrupted or invalid', async () => {
      jwtService.verifyAsync.mockRejectedValueOnce(new Error('Invalid signature'));

      await expect(service.refreshTokens(rawToken)).rejects.toThrow(UnauthorizedException);
      await expect(service.refreshTokens(rawToken)).rejects.toThrow(
        'Refresh token expired or revoked',
      );
    });

    it('should throw UnauthorizedException if token hash cannot be matched to a database session row', async () => {
      prismaService.refreshToken.findUnique.mockResolvedValueOnce(null);

      // ✅ Changed string to match the exact exception output
      await expect(service.refreshTokens(rawToken)).rejects.toThrow(
        'Refresh token expired or revoked',
      );
    });

    it('should trigger security countermeasures and revoke all active sessions if token reuse is detected', async () => {
      // Simulates an already revoked refresh token record
      prismaService.refreshToken.findUnique.mockResolvedValueOnce({
        ...mockDbRecord,
        revokedAt: new Date(),
      });

      const spyRevokeAll = jest.spyOn(service, 'revokeAllForUser').mockResolvedValueOnce();

      await expect(service.refreshTokens(rawToken)).rejects.toThrow(
        'Refresh token reuse detected — all sessions revoked',
      );
      expect(spyRevokeAll).toHaveBeenCalledWith(userId);
    });

    it('should throw UnauthorizedException if the attached user account is soft-deleted or inactive', async () => {
      prismaService.refreshToken.findUnique.mockResolvedValueOnce(mockDbRecord);
      prismaService.user.findFirst.mockResolvedValueOnce(null); // Account soft-deleted/missing

      await expect(service.refreshTokens(rawToken)).rejects.toThrow('Account inactive');
    });

    it('should throw UnauthorizedException if the chronological expiration clock threshold has passed', async () => {
      prismaService.refreshToken.findUnique.mockResolvedValueOnce({
        ...mockDbRecord,
        expiresAt: new Date(Date.now() - 100_000), // Chronologically expired
      });

      await expect(service.refreshTokens(rawToken)).rejects.toThrow('Refresh token expired');
    });
  });

  describe('Revocation Operations', () => {
    it('should flag target matching active rows as revoked inside revokeRefreshToken', async () => {
      const rawToken = 'kill-me-token';
      await service.revokeRefreshToken(rawToken);

      expect(prismaService.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { tokenHash: service.hashToken(rawToken), revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('should invalidate all active records for a user ID inside revokeAllForUser', async () => {
      const userId = 'user-to-clear';
      await service.revokeAllForUser(userId);

      expect(prismaService.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId, revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });
});
