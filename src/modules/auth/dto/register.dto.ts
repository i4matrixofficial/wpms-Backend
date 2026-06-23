import { z } from 'zod';

export const RegisterSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
  role: z.enum(['customer', 'worker']).default('customer'), // never admin via signup
});
export type RegisterDto = z.infer<typeof RegisterSchema>;
