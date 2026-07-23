import { z } from 'zod';

export const RefundPaymentSchema = z.object({
  reason: z.string().max(500).optional(),
});
export type RefundPaymentDto = z.infer<typeof RefundPaymentSchema>;
