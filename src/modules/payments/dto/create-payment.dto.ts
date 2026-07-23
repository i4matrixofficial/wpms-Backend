import { z } from 'zod';

export const CreatePaymentSchema = z.object({
  jobId: z.uuid().meta({
    description:
      'The job to pay for. Amount is taken from the job (finalPrice, falling back to estimatedPrice) — never from the client.',
  }),
});
export type CreatePaymentDto = z.infer<typeof CreatePaymentSchema>;
