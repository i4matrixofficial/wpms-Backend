import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.url(), // top-level (v4)
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),
  S3_ENDPOINT: z.url(),
  S3_REGION: z.string().default('us-east-1'),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_FORCE_PATH_STYLE: z.coerce.boolean().default(true),
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().default(1025),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASS: z.string().optional().default(''),
  SMTP_FROM: z.string().default('no-reply@wpms.local'),
  PAYMENT_GATEWAY_PROVIDER: z.enum(['mock']).default('mock'),
  // % the platform keeps from a worker's earnings (0 = worker gets the full amount)
  PLATFORM_COMMISSION_PERCENT: z.coerce.number().min(0).max(100).default(0),
  // when a customer cancels an in-progress job, % of the paid amount refunded to
  // them; the remainder is paid out to the worker (minus commission)
  CANCEL_INPROGRESS_REFUND_PERCENT: z.coerce
    .number()
    .min(0)
    .max(100)
    .default(50),
});

export type Env = z.infer<typeof envSchema>;
