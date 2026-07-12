import { z } from 'zod';
import { ComplaintStatus } from '../enums/complaint-status.enum';

export const SubmitComplaintSchema = z
  .object({
    userId: z.string().uuid(),
    againstUserId: z.string().uuid(),
    bookingId: z.string().uuid(),
    description: z.string().trim().min(10).max(5000),
  })
  .refine((data) => data.userId !== data.againstUserId, {
    message: 'Cannot file a complaint against yourself',
    path: ['againstUserId'],
  });

export type SubmitComplaintDto = z.infer<typeof SubmitComplaintSchema>;

export const UpdateComplaintStatusSchema = z.object({
  status: z.enum([
    ComplaintStatus.UNDER_REVIEW,
    ComplaintStatus.RESOLVED,
  ]),
  adminNote: z.string().trim().min(1).max(2000).optional(),
});

export type UpdateComplaintStatusDto = z.infer<
  typeof UpdateComplaintStatusSchema
>;

export const ListComplaintsQuerySchema = z.object({
  userId: z.string().uuid().optional(),
  againstUserId: z.string().uuid().optional(),
  bookingId: z.string().uuid().optional(),
  status: z.nativeEnum(ComplaintStatus).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

export type ListComplaintsQueryDto = z.infer<typeof ListComplaintsQuerySchema>;
