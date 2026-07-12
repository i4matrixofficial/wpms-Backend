import { z } from 'zod';

export const CreateServiceTypeSchema = z.object({
  name: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[a-z_]+$/, 'lowercase and underscores only')
    .meta({ description: 'Machine key', example: 'ac_repair' }),
  displayName: z
    .string()
    .min(2)
    .max(100)
    .meta({ description: 'Shown to users', example: 'AC Repair' }),
  pricingModel: z
    .enum(['flat', 'per_unit'])
    .meta({ description: 'flat = fixed price; per_unit = quantity × rate' }),
  unit: z
    .enum(['hour', 'square_meter', 'room', 'unit', 'flat'])
    .meta({ description: 'What is measured' }),
  baseRate: z
    .number()
    .positive()
    .meta({ description: 'Per-unit rate or flat amount (LKR)', example: 1500 }),
  priceTiming: z
    .enum(['upfront', 'on_completion'])
    .meta({
      description:
        'upfront = known at booking; on_completion = worker sets, customer confirms',
    }),
});
export type CreateServiceTypeDto = z.infer<typeof CreateServiceTypeSchema>;
