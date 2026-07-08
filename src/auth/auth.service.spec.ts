import { TokenType, User } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import { AuthService } from './auth.service';
import { TokenService } from './services/token.service';
import { VerificationTokenService } from './services/verification-token.service';
import { PasswordService } from '../common/crypto/password.service';
import { UserService } from '../user/user.service';
import type { Env } from '../config/env.validation';
import { RegisterDto } from './dto/auth.dto';

// A minimal User fixture (includes the fields sanitize() strips).
const USER: User = {
  id: 'user-1',
  email: 'user@example.com',
  emailVerified: false,
  passwordHash: 'HASHED',
  firstName: 'Test',
  lastName: null,
  avatarUrl: null,
  status: false,
  lastLoginAt: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  deletedAt: null,
};

const FRONTEND_URL = 'https://app.example.com';

describe('AuthService', () => {
  let service: AuthService;

  let mailQueue: jest.Mocked<Pick<Queue, 'add'>>;
  let users: jest.Mocked<
    Pick<
      UserService,
      | 'create'
      | 'updateLastLogin'
      | 'markEmailVerified'
      | 'findByEmailWithPassword'
      | 'updatePassword'
    >
  >;
  let tokens: jest.Mocked<
    Pick<TokenService, 'issueTokens' | 'refreshTokens' | 'revokeRefreshToken' | 'revokeAllForUser'>
  >;
  let verificationTokens: jest.Mocked<Pick<VerificationTokenService, 'create' | 'consume'>>;
  let password: jest.Mocked<Pick<PasswordService, 'hash'>>;
  let config: jest.Mocked<Pick<ConfigService<Env, true>, 'get'>>;

  beforeEach(() => {
    mailQueue = { add: jest.fn().mockResolvedValue(undefined) };

    users = {
      create: jest.fn().mockResolvedValue(USER),
      updateLastLogin: jest.fn().mockResolvedValue(USER),
      markEmailVerified: jest.fn().mockResolvedValue(USER),
      findByEmailWithPassword: jest.fn(),
      updatePassword: jest.fn().mockResolvedValue(USER),
    };

    tokens = {
      issueTokens: jest.fn().mockResolvedValue({ accessToken: 'access', refreshToken: 'refresh' }),
      refreshTokens: jest
        .fn()
        .mockResolvedValue({ accessToken: 'new-access', refreshToken: 'new-refresh' }),
      revokeRefreshToken: jest.fn().mockResolvedValue(undefined),
      revokeAllForUser: jest.fn().mockResolvedValue(undefined),
    };

    verificationTokens = {
      create: jest.fn().mockResolvedValue('raw-token'),
      consume: jest.fn().mockResolvedValue('user-1'),
    };

    password = { hash: jest.fn().mockResolvedValue('NEW-HASH') };

    config = {
      get: jest.fn(() => FRONTEND_URL) as unknown as jest.Mocked<ConfigService<Env, true>>['get'],
    };

    service = new AuthService(
      mailQueue as unknown as Queue,
      users as unknown as UserService,
      tokens as unknown as TokenService,
      verificationTokens as unknown as VerificationTokenService,
      config as unknown as ConfigService<Env, true>,
      password as unknown as PasswordService,
    );
  });

  afterEach(() => jest.clearAllMocks());

  describe('register', () => {
    it('should successfully register a user even if the optional meta parameter is missing properties', async () => {
      const dto: RegisterDto = {
        email: 'test@example.com',
        password: 'password123',
      };

      // Ensures the method handles implicit argument spacing safely
      const result = await service.register(dto);
      expect(result.user).toBeDefined();
    });
    it('creates the user and issues an EMAIL_VERIFICATION token (24h)', async () => {
      await service.register({ email: 'user@example.com', password: 'pw' });

      expect(users.create).toHaveBeenCalled();
      expect(verificationTokens.create).toHaveBeenCalledWith(
        'user-1',
        TokenType.EMAIL_VERIFICATION,
        24 * 60 * 60 * 1000,
      );
    });

    it('enqueues an email-verification job with a link containing the raw token', async () => {
      await service.register({ email: 'user@example.com', password: 'pw' });

      expect(mailQueue.add).toHaveBeenCalledWith('email-verification', {
        email: 'user@example.com',
        link: `${FRONTEND_URL}/verify-email?token=raw-token`,
      });
    });

    it('returns the sanitized user without passwordHash or deletedAt', async () => {
      const result = await service.register({ email: 'user@example.com', password: 'pw' });

      expect(result.user).not.toHaveProperty('passwordHash');
      expect(result.user).not.toHaveProperty('deletedAt');
      expect(result.user).toMatchObject({ id: 'user-1', email: 'user@example.com' });
    });

    it('does NOT issue auth tokens on register (only verification)', async () => {
      await service.register({ email: 'user@example.com', password: 'pw' });
      expect(tokens.issueTokens).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('updates lastLogin, issues tokens, returns sanitized user + tokens', async () => {
      const meta = { userAgent: 'jest', ipAddress: '127.0.0.1' };
      const result = await service.login(USER, meta);

      expect(users.updateLastLogin).toHaveBeenCalledWith('user-1');
      expect(tokens.issueTokens).toHaveBeenCalledWith('user-1', 'user@example.com', meta);
      expect(result).toMatchObject({
        accessToken: 'access',
        refreshToken: 'refresh',
      });
      expect(result.user).not.toHaveProperty('passwordHash');
    });
    it('should successfully log in a user even if the optional meta parameter is omitted (Branch False)', async () => {
      // Call login WITHOUT passing the second 'meta' argument
      const result = await service.login(USER);

      // expect(userService.updateLastLogin).toHaveBeenCalledWith('user-123');
      // expect(tokenService.issueTokens).toHaveBeenCalledWith(
      //   'user-123',
      //   'test@example.com',
      //   undefined,
      // );
      expect(result).toHaveProperty('accessToken');
    });
    it('works when meta is omitted (optional param branch)', async () => {
      const result = await service.login(USER); // ← NO meta

      expect(users.updateLastLogin).toHaveBeenCalledWith('user-1');
      expect(tokens.issueTokens).toHaveBeenCalledWith('user-1', 'user@example.com', undefined);
      expect(result).toMatchObject({ accessToken: 'access', refreshToken: 'refresh' });
    });
  });

  describe('verifyEmail', () => {
    it('consumes an EMAIL_VERIFICATION token and marks the user verified', async () => {
      const result = await service.verifyEmail('raw-token');

      expect(verificationTokens.consume).toHaveBeenCalledWith(
        'raw-token',
        TokenType.EMAIL_VERIFICATION,
      );
      expect(users.markEmailVerified).toHaveBeenCalledWith('user-1');
      expect(result).toEqual({ success: true });
    });
  });

  describe('refresh', () => {
    it('delegates to tokenService.refreshTokens', async () => {
      const result = await service.refresh('old-refresh', { ipAddress: '1.1.1.1' });
      expect(tokens.refreshTokens).toHaveBeenCalledWith('old-refresh', { ipAddress: '1.1.1.1' });
      expect(result).toEqual({ accessToken: 'new-access', refreshToken: 'new-refresh' });
    });
  });

  describe('logout', () => {
    it('revokes the single refresh token', async () => {
      const result = await service.logout('some-refresh');
      expect(tokens.revokeRefreshToken).toHaveBeenCalledWith('some-refresh');
      expect(result).toEqual({ success: true });
    });
  });

  describe('forgotPassword', () => {
    it('issues a PASSWORD_RESET token (1h) and enqueues an email when the user exists', async () => {
      users.findByEmailWithPassword.mockResolvedValueOnce(USER);

      await service.forgotPassword('user@example.com');

      expect(verificationTokens.create).toHaveBeenCalledWith(
        'user-1',
        TokenType.PASSWORD_RESET,
        60 * 60 * 1000,
      );
      expect(mailQueue.add).toHaveBeenCalledWith('password-reset', {
        email: 'user@example.com',
        link: `${FRONTEND_URL}/reset-password?token=raw-token`,
      });
    });

    it('is enumeration-safe: returns success but does nothing when user is missing', async () => {
      users.findByEmailWithPassword.mockResolvedValueOnce(null);

      const result = await service.forgotPassword('nobody@example.com');

      expect(result).toEqual({ success: true }); // same response either way
      expect(verificationTokens.create).not.toHaveBeenCalled();
      expect(mailQueue.add).not.toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    it('consumes token, hashes+saves new password, and revokes ALL sessions', async () => {
      const result = await service.resetPassword('raw-token', 'NewPass123');

      expect(verificationTokens.consume).toHaveBeenCalledWith(
        'raw-token',
        TokenType.PASSWORD_RESET,
      );
      expect(password.hash).toHaveBeenCalledWith('NewPass123');
      expect(users.updatePassword).toHaveBeenCalledWith('user-1', 'NEW-HASH');
      expect(tokens.revokeAllForUser).toHaveBeenCalledWith('user-1');
      expect(result).toEqual({ success: true });
    });
  });

  describe('logoutAll', () => {
    it('revokes all refresh tokens for the given USER ID', async () => {
      await service.logoutAll('user-1'); // should be a userId

      expect(tokens.revokeAllForUser).toHaveBeenCalledWith('user-1');
    });
  });
});
