jest.mock('argon2', () => ({
  argon2id: 2,
  hash: jest.fn(),
  verify: jest.fn(),
}));

import * as argon2 from 'argon2';
import { PasswordService } from './password.service';

describe('PasswordService (mocked argon2)', () => {
  let service: PasswordService;
  const mockHash = argon2.hash as jest.Mock;
  const mockVerify = argon2.verify as jest.Mock;

  beforeEach(() => {
    service = new PasswordService();
    jest.clearAllMocks();
  });

  describe('hash', () => {
    it('hashes with the argon2id variant', async () => {
      mockHash.mockResolvedValueOnce('$argon2id$hashed');

      const result = await service.hash('my-password');

      expect(mockHash).toHaveBeenCalledWith('my-password', {
        type: argon2.argon2id,
      });
      expect(result).toBe('$argon2id$hashed');
    });

    it('passes the plaintext through unchanged to argon2', async () => {
      mockHash.mockResolvedValueOnce('h');
      await service.hash('P@ssw0rd!');
      expect(mockHash).toHaveBeenCalledWith('P@ssw0rd!', expect.any(Object));
    });
  });

  describe('verify', () => {
    it('calls argon2.verify with (hash, plain) in that order', async () => {
      mockVerify.mockResolvedValueOnce(true);

      const ok = await service.verify('$argon2id$stored', 'my-password');

      expect(mockVerify).toHaveBeenCalledWith('$argon2id$stored', 'my-password');
      expect(ok).toBe(true);
    });

    it('returns false when argon2 reports a mismatch', async () => {
      mockVerify.mockResolvedValueOnce(false);
      await expect(service.verify('hash', 'wrong')).resolves.toBe(false);
    });
  });
});
