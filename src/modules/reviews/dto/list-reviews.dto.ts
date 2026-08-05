import { z } from 'zod';
import { ReviewDirection } from '../entities/review.entity';

export const ListReviewsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  // e.g. only the reviews a user received as a worker
  direction: z.nativeEnum(ReviewDirection).optional(),
});
export type ListReviewsDto = z.infer<typeof ListReviewsSchema>;
