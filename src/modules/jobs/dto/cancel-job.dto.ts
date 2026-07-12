import { z } from 'zod';
export const CancelJobSchema = z.object({
  reason: z.string().max(300).optional(),
});
export type CancelJobDto = z.infer<typeof CancelJobSchema>;
