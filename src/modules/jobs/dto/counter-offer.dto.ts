import { z } from 'zod';

export const CounterOfferSchema = z.object({
  price: z.number().positive().meta({
    description: 'A new price proposed within an existing negotiation thread',
  }),
  message: z.string().max(500).optional(),
});
export type CounterOfferDto = z.infer<typeof CounterOfferSchema>;
