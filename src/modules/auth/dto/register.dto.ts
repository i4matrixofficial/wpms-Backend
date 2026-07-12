import { z } from 'zod';

export const RegisterSchema = z.object({
  fullName: z.string().min(2).max(100),
  email: z.email(),
  password: z.string().min(8),
  role: z.enum(['customer', 'worker']).default('customer'),
});
export type RegisterDto = z.infer<typeof RegisterSchema>;
