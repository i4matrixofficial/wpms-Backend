import { z } from 'zod';

export const ListPaymentsSchema = z.object({
  status: z
    .enum(['pending', 'succeeded', 'failed', 'refunded'])
    .optional()
    .meta({ description: 'Filter by payment status' }),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListPaymentsDto = z.infer<typeof ListPaymentsSchema>;
