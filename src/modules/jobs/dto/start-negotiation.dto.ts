import { z } from 'zod';

export const StartNegotiationSchema = z.object({
  price: z.number().positive().meta({
    description: "The worker's opening price proposal for this job",
  }),
  message: z.string().max(500).optional(),
});
export type StartNegotiationDto = z.infer<typeof StartNegotiationSchema>;
