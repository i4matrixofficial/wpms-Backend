import { z } from 'zod';

export const RegisterSchema = z.object({
  fullName: z.string().min(2).max(100).meta({
    description: 'Full name of the user. Shown across all three apps.',
    example: 'Samudra De Silva',
  }),

  email: z.email().meta({
    description:
      'Email address. Used as the login identifier — must be unique.',
    example: 'worker1@test.com',
  }),

  password: z.string().min(8).meta({
    description:
      'Account password. Minimum 8 characters. Stored hashed (Argon2).',
    example: 'password123',
  }),

  role: z.enum(['customer', 'worker']).default('customer').meta({
    description:
      'Account role. Defaults to "customer" if omitted. Admin accounts cannot be created here.',
  }),
});
export type RegisterDto = z.infer<typeof RegisterSchema>;
