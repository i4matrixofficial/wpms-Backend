import { z } from 'zod';

export const HideReviewSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});
export type HideReviewDto = z.infer<typeof HideReviewSchema>;
