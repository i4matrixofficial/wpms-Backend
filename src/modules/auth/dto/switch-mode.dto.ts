import { z } from 'zod';

export const SwitchModeSchema = z.object({
  mode: z.enum(['customer', 'worker']).meta({
    description: 'The mode to operate in. Worker requires verification.',
  }),
});
export type SwitchModeDto = z.infer<typeof SwitchModeSchema>;
