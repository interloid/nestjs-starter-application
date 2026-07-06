import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { TokenService, JwtPayload } from './token.service';
import { PrismaService } from '../../prisma/prisma.service';
import type { Env } from '../../config/env.validation';

type EnvConfig = Pick<
  Env,
  'JWT_ACCESS_SECRET' | 'JWT_REFRESH_SECRET' | 'JWT_ACCESS_TTL' | 'JWT_REFRESH_TTL'
>;

const ENV: EnvConfig = {
  JWT_ACCESS_SECRET: 'access-secret-value',
  JWT_REFRESH_SECRET: 'refresh-secret-value',
  JWT_ACCESS_TTL: '15m',
  JWT_REFRESH_TTL: '7d',
};

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

describe('TokenService', () => {
  let service: TokenService;
  let jwt: jest.Mocked<Pick<JwtService, 'signAsync' | 'verifyAsync'>>;
  let config: jest.Mocked<Pick<ConfigService<Env, true>, 'get'>>;
  let prisma: {
    refreshToken: {
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
  };

  beforeEach(() => {
    jwt = {
      signAsync: jest.fn(),
      verifyAsync: jest.fn(),
    };

    config = {
      get: jest.fn((key: keyof EnvConfig) => ENV[key]) as unknown as jest.Mocked<
        ConfigService<Env, true>
      >['get'],
    };

    prisma = {
      refreshToken: {
        create: jest.fn().mockResolvedValue({ id: 'rt-1' }),
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({ id: 'rt-1' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    service = new TokenService(
      jwt as unknown as JwtService,
      config as unknown as ConfigService<Env, true>,
      prisma as unknown as PrismaService,
    );
  });

  afterEach(() => jest.clearAllMocks());


  describe('issueTokens', () => {
    beforeEach(() => {
      jwt.signAsync
        .mockResolvedValueOnce('signed-access-token') // access
        .mockResolvedValueOnce('signed-refresh-token'); // refresh
    });

    it('signs the access token with the ACCESS secret and TTL', async () => {
      await service.issueTokens('user-1', 'user@example.com');

      expect(jwt.signAsync).toHaveBeenNthCalledWith(
        1,
        { sub: 'user-1', email: 'user@example.com' } satisfies JwtPayload,
        { secret: ENV.JWT_ACCESS_SECRET, expiresIn: ENV.JWT_ACCESS_TTL },
      );
    });

    it('signs the refresh token with the REFRESH secret, TTL, and a jti', async () => {
      await service.issueTokens('user-1', 'user@example.com');

      const [payloadArg, optsArg] = jwt.signAsync.mock.calls[1];
      expect(payloadArg).toMatchObject({ sub: 'user-1', email: 'user@example.com' });
      expect(payloadArg).toHaveProperty('jti'); // unique id present
      expect(optsArg).toEqual({
        secret: ENV.JWT_REFRESH_SECRET,
        expiresIn: ENV.JWT_REFRESH_TTL,
      });
    });

    it('stores the HASH of the refresh token, never the raw token', async () => {
      await service.issueTokens('user-1', 'user@example.com', {
        userAgent: 'jest',
        ipAddress: '127.0.0.1',
      });

      expect(prisma.refreshToken.create).toHaveBeenCalledTimes(1);
      const createArg = prisma.refreshToken.create.mock.calls[0][0].data;

      expect(createArg.tokenHash).toBe(sha256('signed-refresh-token'));
      expect(JSON.stringify(createArg)).not.toContain('signed-refresh-token');
      expect(createArg.userId).toBe('user-1');
      expect(createArg.userAgent).toBe('jest');
      expect(createArg.ipAddress).toBe('127.0.0.1');
      expect(createArg.expiresAt).toBeInstanceOf(Date);
    });

    it('returns both raw tokens to the caller', async () => {
      const result = await service.issueTokens('user-1', 'user@example.com');
      expect(result).toEqual({
        accessToken: 'signed-access-token',
        refreshToken: 'signed-refresh-token',
      });
    });
    it('handles partial meta (one field present, one absent)', async () => {
      jwt.signAsync.mockResolvedValueOnce('access').mockResolvedValueOnce('refresh');

      await service.issueTokens('user-1', 'user@example.com', { userAgent: 'ua-only' });

      const data = prisma.refreshToken.create.mock.calls[0][0].data;
      expect(data.userAgent).toBe('ua-only');
      expect(data.ipAddress).toBeUndefined();
    });

    it('generates a distinct jti per call (tokens are not identical)', async () => {
      jwt.signAsync.mockReset();
      jwt.signAsync.mockResolvedValue('x'); // any value
      await service.issueTokens('user-1', 'a@b.com');
      await service.issueTokens('user-1', 'a@b.com');

      const jti1 = (jwt.signAsync.mock.calls[1][0] as { jti: string }).jti;
      const jti2 = (jwt.signAsync.mock.calls[3][0] as { jti: string }).jti;
      expect(jti1).not.toBe(jti2);
    });
  });


  describe('hashToken', () => {
    it('produces a stable SHA-256 hex digest', () => {
      expect(service.hashToken('abc')).toBe(sha256('abc'));
      expect(service.hashToken('abc')).toBe(service.hashToken('abc')); // deterministic
    });

    it('produces different hashes for different inputs', () => {
      expect(service.hashToken('abc')).not.toBe(service.hashToken('abd'));
    });
  });


  describe('refreshTokens', () => {
    const validStored = {
      id: 'rt-1',
      userId: 'user-1',
      tokenHash: sha256('old-refresh'),
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000), // not expired
    };

    it('rejects a token that fails JWT verification', async () => {
      jwt.verifyAsync.mockRejectedValueOnce(new Error('bad signature'));

      await expect(service.refreshTokens('tampered')).rejects.toThrow(UnauthorizedException);
      expect(prisma.refreshToken.findUnique).not.toHaveBeenCalled();
    });

    it('rejects when the token is not found in the store', async () => {
      jwt.verifyAsync.mockResolvedValueOnce({ sub: 'user-1', email: 'a@b.com', jti: 'j' });
      prisma.refreshToken.findUnique.mockResolvedValueOnce(null);

      await expect(service.refreshTokens('old-refresh')).rejects.toThrow(UnauthorizedException);
    });

    it('rejects a revoked token', async () => {
      jwt.verifyAsync.mockResolvedValueOnce({ sub: 'user-1', email: 'a@b.com', jti: 'j' });
      prisma.refreshToken.findUnique.mockResolvedValueOnce({
        ...validStored,
        revokedAt: new Date(),
      });

      await expect(service.refreshTokens('old-refresh')).rejects.toThrow(
        'Refresh token expired or revoked',
      );
    });

    it('rejects an expired token', async () => {
      jwt.verifyAsync.mockResolvedValueOnce({ sub: 'user-1', email: 'a@b.com', jti: 'j' });
      prisma.refreshToken.findUnique.mockResolvedValueOnce({
        ...validStored,
        expiresAt: new Date(Date.now() - 1000), // expired
      });

      await expect(service.refreshTokens('old-refresh')).rejects.toThrow(UnauthorizedException);
    });

    it('looks up the stored row by the HASH of the raw token', async () => {
      jwt.verifyAsync.mockResolvedValueOnce({ sub: 'user-1', email: 'a@b.com', jti: 'j' });
      prisma.refreshToken.findUnique.mockResolvedValueOnce(validStored);
      jwt.signAsync.mockResolvedValue('new-token');

      await service.refreshTokens('old-refresh');

      expect(prisma.refreshToken.findUnique).toHaveBeenCalledWith({
        where: { tokenHash: sha256('old-refresh') },
      });
    });

    it('ROTATES: revokes the old token, then issues a new pair', async () => {
      jwt.verifyAsync.mockResolvedValueOnce({ sub: 'user-1', email: 'a@b.com', jti: 'j' });
      prisma.refreshToken.findUnique.mockResolvedValueOnce(validStored);
      jwt.signAsync.mockResolvedValueOnce('new-access').mockResolvedValueOnce('new-refresh');

      const result = await service.refreshTokens('old-refresh');

      expect(prisma.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 'rt-1' },
        data: { revokedAt: expect.any(Date) },
      });
      expect(prisma.refreshToken.create).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ accessToken: 'new-access', refreshToken: 'new-refresh' });
    });
  });


  describe('revokeRefreshToken', () => {
    it('revokes by hash, only rows not already revoked', async () => {
      await service.revokeRefreshToken('some-token');

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { tokenHash: sha256('some-token'), revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });

  describe('revokeAllForUser', () => {
    it('revokes all active tokens for the user', async () => {
      await service.revokeAllForUser('user-1');

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });


  describe('refresh expiry / ttlToMs parsing', () => {
    const parse = (ttl: string): number =>
      (service as unknown as { ttlToMs(t: string): number }).ttlToMs(ttl);

    it.each([
      ['30s', 30_000],
      ['15m', 15 * 60_000],
      ['2h', 2 * 3_600_000],
      ['7d', 7 * 86_400_000],
    ])('parses %s correctly', (ttl, expected) => {
      expect(parse(ttl)).toBe(expected);
    });

    it('falls back to 7 days for an unparseable TTL', () => {
      expect(parse('garbage')).toBe(7 * 24 * 60 * 60 * 1000);
    });

    it('stores an expiresAt in the future on issueTokens', async () => {
      jwt.signAsync.mockResolvedValue('t');
      const before = Date.now();
      await service.issueTokens('user-1', 'a@b.com');

      const expiresAt: Date = prisma.refreshToken.create.mock.calls[0][0].data.expiresAt;
      expect(expiresAt.getTime()).toBeGreaterThan(before);
    });
  });
});
