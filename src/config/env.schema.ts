import { z } from 'zod';
import { isValidTimeZone } from '../common/utils/timezone.util';

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
  REDIS_URL: z.string().default('redis://localhost:6379'),
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
  // IANA zone the marketplace operates in. Scheduled-job tracking windows open
  // at a wall-clock hour in THIS zone, not in whatever the server happens to be
  // set to — otherwise a UTC host opens an 8am window at 1:30pm local.
  // rejected at boot rather than at the first ping — a typo'd zone would
  // otherwise throw from deep inside Intl months later
  MARKET_TIMEZONE: z
    .string()
    .refine(isValidTimeZone, 'must be a valid IANA timezone name')
    .default('Asia/Colombo'),
  // hour (0-23, market time) at which live tracking opens on a scheduled job's
  // day. Integer: Date.UTC silently truncates a fractional hour, so a typo'd
  // 8.5 would be accepted and then quietly mean 8.
  SCHEDULED_TRACKING_START_HOUR: z.coerce
    .number()
    .int()
    .min(0)
    .max(23)
    .default(8),
  // floor on the gap between accepted location pings for one job; extra pings
  // are rejected with 429. 0 disables throttling. Integer: Redis rejects a
  // fractional PX argument on every call, and the throttle fails open, so a
  // non-integer here would silently disable rate limiting altogether.
  LOCATION_MIN_PING_INTERVAL_MS: z.coerce.number().int().min(0).default(500),
});

export type Env = z.infer<typeof envSchema>;
