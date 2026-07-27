import { z } from 'zod';

export const CreateJobSchema = z
  .object({
    serviceTypeId: z
      .uuid()
      .meta({ description: 'Which service type (from /service-types)' }),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    description: z.string().max(500).optional(),
    type: z.enum(['immediate', 'scheduled']).default('immediate'),
    scheduledAt: z.coerce.date().optional(),
    quantity: z.number().positive().optional().meta({
      description: 'Units for per-unit upfront pricing (e.g. 3 AC units)',
    }),
    budget: z.number().positive().optional().meta({
      description:
        'Non-binding budget hint shown to workers, for negotiable (on_completion) service types only. Ignored for upfront-priced jobs — those already have a fixed estimatedPrice.',
    }),
  })
  .refine((d) => d.type !== 'scheduled' || !!d.scheduledAt, {
    message: 'scheduledAt is required for scheduled jobs',
    path: ['scheduledAt'],
  });
export type CreateJobDto = z.infer<typeof CreateJobSchema>;
