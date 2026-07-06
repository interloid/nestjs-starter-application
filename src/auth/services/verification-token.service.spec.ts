import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { TokenType } from '@prisma/client';
import { VerificationTokenService } from './verification-token.service';
import { PrismaService } from '../../prisma/prisma.service';

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

describe('VerificationTokenService', () => {
  let service: VerificationTokenService;
  let prisma: {
    verificationToken: {
      create: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      verificationToken: {
        create: jest.fn().mockResolvedValue({ id: 'vt-1' }),
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue({ id: 'vt-1' }),
      },
    };

    service = new VerificationTokenService(prisma as unknown as PrismaService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('create', () => {
    it('returns a raw hex token and stores only its hash (never the raw token)', async () => {
      const raw = await service.create('user-1', TokenType.EMAIL_VERIFICATION, 1000);

      expect(raw).toMatch(/^[a-f0-9]{64}$/);

      const data = prisma.verificationToken.create.mock.calls[0][0].data;
      expect(data.tokenHash).toBe(sha256(raw));
      expect(JSON.stringify(data)).not.toContain(raw);
    });

    it('persists userId, type, and a future expiresAt from the TTL', async () => {
      const before = Date.now();
      await service.create('user-1', TokenType.PASSWORD_RESET, 60_000);

      const data = prisma.verificationToken.create.mock.calls[0][0].data;
      expect(data.userId).toBe('user-1');
      expect(data.type).toBe(TokenType.PASSWORD_RESET);
      expect(data.expiresAt).toBeInstanceOf(Date);
      expect((data.expiresAt as Date).getTime()).toBeGreaterThan(before);
    });

    it('generates a unique raw token each call', async () => {
      const a = await service.create('user-1', TokenType.EMAIL_VERIFICATION, 1000);
      const b = await service.create('user-1', TokenType.EMAIL_VERIFICATION, 1000);
      expect(a).not.toBe(b);
    });
  });

  describe('consume', () => {
    it('queries by hash + type + unused + not-expired', async () => {
      prisma.verificationToken.findFirst.mockResolvedValueOnce({
        id: 'vt-1',
        userId: 'user-1',
      });

      await service.consume('the-raw-token', TokenType.EMAIL_VERIFICATION);

      const where = prisma.verificationToken.findFirst.mock.calls[0][0].where;
      expect(where.tokenHash).toBe(sha256('the-raw-token'));
      expect(where.type).toBe(TokenType.EMAIL_VERIFICATION);
      expect(where.usedAt).toBeNull();
      expect(where.expiresAt).toHaveProperty('gt'); // { gt: <now> }
      expect(where.expiresAt.gt).toBeInstanceOf(Date);
    });

    it('returns the userId and marks the token used (single-use)', async () => {
      prisma.verificationToken.findFirst.mockResolvedValueOnce({
        id: 'vt-1',
        userId: 'user-42',
      });

      const userId = await service.consume('tok', TokenType.PASSWORD_RESET);

      expect(userId).toBe('user-42');
      expect(prisma.verificationToken.update).toHaveBeenCalledWith({
        where: { id: 'vt-1' },
        data: { usedAt: expect.any(Date) },
      });
    });

    it('throws BadRequestException when no matching token is found', async () => {
      prisma.verificationToken.findFirst.mockResolvedValueOnce(null);

      await expect(service.consume('bad-token', TokenType.EMAIL_VERIFICATION)).rejects.toThrow(
        BadRequestException,
      );

      expect(prisma.verificationToken.update).not.toHaveBeenCalled();
    });

    it('rejects when the wrong token type is requested', async () => {
      prisma.verificationToken.findFirst.mockResolvedValueOnce(null);

      await expect(service.consume('tok', TokenType.EMAIL_VERIFICATION)).rejects.toThrow(
        'Invalid or expired token',
      );
    });
  });

  describe('hashing', () => {
    it('create and consume derive the same hash for the same raw token', async () => {
      const raw = await service.create('user-1', TokenType.EMAIL_VERIFICATION, 1000);
      const storedHash = prisma.verificationToken.create.mock.calls[0][0].data.tokenHash;

      prisma.verificationToken.findFirst.mockResolvedValueOnce({ id: 'vt-1', userId: 'user-1' });
      await service.consume(raw, TokenType.EMAIL_VERIFICATION);
      const lookupHash = prisma.verificationToken.findFirst.mock.calls[0][0].where.tokenHash;

      expect(lookupHash).toBe(storedHash);
    });
  });
});
