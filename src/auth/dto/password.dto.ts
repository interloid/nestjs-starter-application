import { createZodDto } from 'nestjs-zod';
import z from 'zod';

const ForgotSchema = z.object({ email: z.email() });
export class ForgotPasswordDto extends createZodDto(ForgotSchema) {}

const ResetSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).max(72),
});
export class ResetPasswordDto extends createZodDto(ResetSchema) {}
