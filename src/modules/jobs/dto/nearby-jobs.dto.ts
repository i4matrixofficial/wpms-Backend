import { z } from 'zod';

export const NearbyJobsSchema = z.object({
  lat: z.coerce.number().min(-90).max(90).meta({
    description: "Worker's current latitude",
  }),
  lng: z.coerce.number().min(-180).max(180).meta({
    description: "Worker's current longitude",
  }),
  radiusKm: z.coerce.number().positive().max(50).default(10).meta({
    description: 'Search radius in kilometers (max 50)',
  }),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type NearbyJobsDto = z.infer<typeof NearbyJobsSchema>;
