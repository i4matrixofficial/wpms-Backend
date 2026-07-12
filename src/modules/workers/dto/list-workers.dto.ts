import { z } from 'zod';

export const ListWorkersSchema = z.object({
  status: z
    .enum(['unverified', 'pending', 'verified', 'rejected'])
    .optional()
    .meta({ description: 'Filter by verification status' }),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListWorkersDto = z.infer<typeof ListWorkersSchema>;
