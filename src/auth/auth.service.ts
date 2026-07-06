import { Injectable } from '@nestjs/common';
import { TokenService } from './services/token.service';
import { User } from '@prisma/client';
import { UserService } from '../user/user.service';
import { RegisterDto } from './dto/auth.dto';
import { VerificationTokenService } from './services/verification-token.service';
import { TokenType } from '@prisma/client';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { MAIL_QUEUE } from '../mail/mail.constants';
import { ConfigService } from '@nestjs/config';
import { PasswordService } from './services/password.service';
import { Env } from '../config/env.validation';

@Injectable()
export class AuthService {
  constructor(
    @InjectQueue(MAIL_QUEUE) private readonly mailQueue: Queue,
    private readonly users: UserService,
    private readonly tokens: TokenService,
    private readonly verificationTokens: VerificationTokenService,
    private readonly config: ConfigService<Env, true>,
    private readonly password: PasswordService,
  ) {}

  async register(dto: RegisterDto) {
    const user = await this.users.create(dto);
    const rawToken = await this.verificationTokens.create(
      user.id,
      TokenType.EMAIL_VERIFICATION,
      24 * 60 * 60 * 1000,
    );
    await this.mailQueue.add('email-verification', {
      email: user.email,
      link: `${this.config.get('FRONTEND_URL', { infer: true })}/verify-email?token=${rawToken}`,
    });

    return { user: this.sanitize(user) };
  }

  async login(user: User, meta?: { userAgent?: string; ipAddress?: string }) {
    await this.users.updateLastLogin(user.id);
    const tokens = await this.tokens.issueTokens(user.id, user.email, meta);
    return { user: this.sanitize(user), ...tokens };
  }

  private sanitize(user: User) {
    const { passwordHash, deletedAt, ...safe } = user;
    return safe;
  }

  async verifyEmail(rawToken: string) {
    const userId = await this.verificationTokens.consume(rawToken, TokenType.EMAIL_VERIFICATION);
    await this.users.markEmailVerified(userId);
    return { success: true };
  }

  async refresh(rawRefreshToken: string, meta?: { userAgent?: string; ipAddress?: string }) {
    return this.tokens.refreshTokens(rawRefreshToken, meta);
  }

  async logout(rawRefreshToken: string) {
    await this.tokens.revokeRefreshToken(rawRefreshToken);
    return { success: true };
  }

  async forgotPassword(email: string) {
    const user = await this.users.findByEmailWithPassword(email);
    if (user) {
      const rawToken = await this.verificationTokens.create(
        user.id,
        TokenType.PASSWORD_RESET,
        60 * 60 * 1000, // 1h
      );
      await this.mailQueue.add('password-reset', {
        email: user.email,
        link: `${this.config.get('FRONTEND_URL', { infer: true })}/reset-password?token=${rawToken}`,
      });
    }
    return { success: true };
  }

  async resetPassword(rawToken: string, newPassword: string) {
    const userId = await this.verificationTokens.consume(rawToken, TokenType.PASSWORD_RESET);

    const passwordHash = await this.password.hash(newPassword);
    await this.users.updatePassword(userId, passwordHash);

    await this.tokens.revokeAllForUser(userId);

    return { success: true };
  }

  async logoutAll(userId: string) {
    await this.tokens.revokeAllForUser(userId);
    return { success: true };
  }
}
