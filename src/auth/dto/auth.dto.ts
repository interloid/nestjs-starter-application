import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const RegisterSchema = z.object({
  email: z.email(),
  password: z.string().min(8).max(72),
  firstName: z.string().min(1).max(50).optional(),
  lastName: z.string().min(1).max(50).optional(),
  role: z.string().min(1).optional(),
  avatarUrl: z.url().optional(),
});
export class RegisterDto extends createZodDto(RegisterSchema) {}

const LoginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});
export class LoginDto extends createZodDto(LoginSchema) {}

const RefreshSchema = z.object({
  refreshToken: z.string().min(1),
});
export class RefreshDto extends createZodDto(RefreshSchema) {}

const VerifyEmailSchema = z.object({ token: z.string().min(1) });
export class VerifyEmailDto extends createZodDto(VerifyEmailSchema) {}
