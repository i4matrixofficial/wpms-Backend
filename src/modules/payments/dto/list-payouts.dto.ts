import { z } from 'zod';

export const ListPayoutsSchema = z.object({
  status: z
    .enum(['pending', 'paid', 'failed'])
    .optional()
    .meta({ description: 'Filter by payout status' }),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListPayoutsDto = z.infer<typeof ListPayoutsSchema>;
