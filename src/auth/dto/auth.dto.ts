import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import zxcvbn from 'zxcvbn';

const RegisterSchema = z.object({
  email: z.email(),
  password: z
    .string()
    .min(8)
    .max(72)
    .refine(
      (p) => zxcvbn(p).score >= 3, // 0-4 scale; require 3+ (strong)
      'Password is too weak — avoid common words and patterns',
    ),

  firstName: z.string().min(1).max(50).optional(),
  lastName: z.string().min(1).max(50).optional(),
  avatarUrl: z.url().optional(),
});
export class RegisterDto extends createZodDto(RegisterSchema) {}

const LoginSchema = z.object({
  email: z.email(),
  password: z
    .string()
    .min(8)
    .max(72)
    .refine(
      (p) => zxcvbn(p).score >= 3, // 0-4 scale; require 3+ (strong)
      'Password is too weak — avoid common words and patterns',
    ),
});
export class LoginDto extends createZodDto(LoginSchema) {}

const RefreshSchema = z.object({
  refreshToken: z.string().min(1),
});
export class RefreshDto extends createZodDto(RefreshSchema) {}

const VerifyEmailSchema = z.object({ token: z.string().min(1) });
export class VerifyEmailDto extends createZodDto(VerifyEmailSchema) {}

const RoleSchema = z.object({
  role: z.string({
    error: 'Role is required',
  }),
});
export class AssignRoleDto extends createZodDto(RoleSchema) {}
