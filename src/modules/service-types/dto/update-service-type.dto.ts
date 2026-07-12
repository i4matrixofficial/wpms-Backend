import { z } from 'zod';

export const UpdateServiceTypeSchema = z.object({
  displayName: z.string().min(2).max(100).optional(),
  baseRate: z.number().positive().optional(),
  isActive: z.boolean().optional(),
});
export type UpdateServiceTypeDto = z.infer<typeof UpdateServiceTypeSchema>;
