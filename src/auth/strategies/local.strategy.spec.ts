import { BadRequestException } from '@nestjs/common';
import { User } from '@prisma/client';
import { LocalStrategy } from './local.strategy';
import { UserService } from '../../user/user.service';
import { PasswordService } from '../../common/crypto/password.service';

const VALID_USER = {
  id: 'user-1',
  email: 'user@example.com',
  passwordHash: 'HASHED',
  emailVerified: true,
  status: true,
} as unknown as User;

describe('LocalStrategy', () => {
  let strategy: LocalStrategy;
  let users: jest.Mocked<Pick<UserService, 'findByEmailWithPassword'>>;
  let password: jest.Mocked<Pick<PasswordService, 'verify'>>;

  beforeEach(() => {
    users = { findByEmailWithPassword: jest.fn() };
    password = { verify: jest.fn() };

    strategy = new LocalStrategy(
      users as unknown as UserService,
      password as unknown as PasswordService,
    );
  });

  afterEach(() => jest.clearAllMocks());

  describe('credential rejection (enumeration-safe)', () => {
    it('throws generic "Invalid credentials" when the user does not exist', async () => {
      users.findByEmailWithPassword.mockResolvedValueOnce(null);

      await expect(strategy.validate('nobody@example.com', 'pw')).rejects.toThrow(
        'Invalid credentials',
      );
      expect(password.verify).not.toHaveBeenCalled();
    });

    it('throws the SAME generic error when the password is wrong', async () => {
      users.findByEmailWithPassword.mockResolvedValueOnce(VALID_USER);
      password.verify.mockResolvedValueOnce(false);

      await expect(strategy.validate('user@example.com', 'wrong')).rejects.toThrow(
        'Invalid credentials',
      );
    });

    it('uses an identical message for missing-user and wrong-password (no enumeration)', async () => {
      users.findByEmailWithPassword.mockResolvedValueOnce(null);
      const err1 = await strategy.validate('a@b.com', 'x').catch((e: Error) => e.message);

      users.findByEmailWithPassword.mockResolvedValueOnce(VALID_USER);
      password.verify.mockResolvedValueOnce(false);
      const err2 = await strategy.validate('a@b.com', 'x').catch((e: Error) => e.message);

      expect(err1).toBe(err2);
    });

    it('verifies the password against the stored hash (hash, plain order)', async () => {
      users.findByEmailWithPassword.mockResolvedValueOnce(VALID_USER);
      password.verify.mockResolvedValueOnce(true);

      await strategy.validate('user@example.com', 'my-password');

      expect(password.verify).toHaveBeenCalledWith('HASHED', 'my-password');
    });
  });

  describe('email verification gate', () => {
    it('throws BadRequestException when email is not verified', async () => {
      users.findByEmailWithPassword.mockResolvedValueOnce({
        ...VALID_USER,
        emailVerified: false,
      });
      password.verify.mockResolvedValueOnce(true);

      await expect(strategy.validate('user@example.com', 'pw')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('status gate', () => {
    it('throws UnauthorizedException when the account is inactive (status false)', async () => {
      users.findByEmailWithPassword.mockResolvedValueOnce({
        ...VALID_USER,
        status: false,
      });
      password.verify.mockResolvedValueOnce(true);

      await expect(strategy.validate('user@example.com', 'pw')).rejects.toThrow(
        'Account is inactive',
      );
    });
  });

  describe('success', () => {
    it('returns the user when credentials, verification, and status all pass', async () => {
      users.findByEmailWithPassword.mockResolvedValueOnce(VALID_USER);
      password.verify.mockResolvedValueOnce(true);

      const result = await strategy.validate('user@example.com', 'correct-pw');

      expect(result).toBe(VALID_USER);
    });
  });
});
