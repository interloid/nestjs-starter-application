import { Injectable, BadRequestException } from '@nestjs/common';
import { randomBytes, createHash } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { TokenType } from '@prisma/client';

@Injectable()
export class VerificationTokenService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, type: TokenType, ttlMs: number): Promise<string> {
    const rawToken = randomBytes(32).toString('hex');
    await this.prisma.verificationToken.create({
      data: {
        userId,
        tokenHash: this.hash(rawToken),
        type,
        expiresAt: new Date(Date.now() + ttlMs),
      },
    });
    return rawToken;
  }

  async consume(rawToken: string, type: TokenType): Promise<string> {
    const record = await this.prisma.verificationToken.findFirst({
      where: { tokenHash: this.hash(rawToken), type, usedAt: null, expiresAt: { gt: new Date() } },
    });
    if (!record) throw new BadRequestException('Invalid or expired token');

    await this.prisma.verificationToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    });
    return record.userId;
  }

  private hash(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }
}
