import { z } from 'zod';

// both fields optional, but an empty body is a no-op we'd rather reject
export const UpdateReviewSchema = z
  .object({
    rating: z.number().int().min(1).max(5).optional(),
    comment: z.string().trim().max(1000).nullable().optional(),
  })
  .refine((v) => v.rating !== undefined || v.comment !== undefined, {
    message: 'Provide rating and/or comment',
  });
export type UpdateReviewDto = z.infer<typeof UpdateReviewSchema>;
