import { z } from 'zod';
export const SetWorkerStatusSchema = z.object({
  status: z.enum(['unverified', 'pending', 'verified', 'rejected']),
});
export type SetWorkerStatusDto = z.infer<typeof SetWorkerStatusSchema>;
