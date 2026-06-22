import { envSchema } from './env.schema';

// Runs at startup. If .env is wrong, the app REFUSES to boot — fail loud, fail early.
export function validateEnv(config: Record<string, unknown>) {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    throw new Error(
      `Invalid environment variables:\n${z.prettifyError(parsed.error)}`,
    );
  }
  return parsed.data;
}
import { z } from 'zod';
