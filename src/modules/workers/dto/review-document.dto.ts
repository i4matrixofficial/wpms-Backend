import { z } from 'zod';

export const ReviewDocumentSchema = z
  .object({
    status: z.enum(['approved', 'rejected']),
    rejectionReason: z.string().min(3).optional(),
  })
  .refine((d) => d.status !== 'rejected' || !!d.rejectionReason, {
    message: 'rejectionReason is required when rejecting',
    path: ['rejectionReason'],
  });
export type ReviewDocumentDto = z.infer<typeof ReviewDocumentSchema>;
