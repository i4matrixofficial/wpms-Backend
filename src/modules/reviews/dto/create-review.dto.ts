import { z } from 'zod';

export const CreateReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().min(1).max(1000).optional(),
});
export type CreateReviewDto = z.infer<typeof CreateReviewSchema>;
