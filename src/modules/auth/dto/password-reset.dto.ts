import { z } from 'zod';

export const ForgotPasswordSchema = z.object({ email: z.email() });
export type ForgotPasswordDto = z.infer<typeof ForgotPasswordSchema>;

export const VerifyOtpSchema = z.object({
  email: z.email(),
  code: z.string().length(6),
});
export type VerifyOtpDto = z.infer<typeof VerifyOtpSchema>;

export const ResetPasswordSchema = z.object({
  resetToken: z.string().min(1),
  newPassword: z.string().min(8),
});
export type ResetPasswordDto = z.infer<typeof ResetPasswordSchema>;
