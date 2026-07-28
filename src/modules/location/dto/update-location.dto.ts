import { z } from 'zod';

export const UpdateLocationSchema = z.object({
  lat: z.number().min(-90).max(90).meta({ description: 'Latitude' }),
  lng: z.number().min(-180).max(180).meta({ description: 'Longitude' }),
  accuracy: z
    .number()
    .nonnegative()
    .max(100000)
    .optional()
    .meta({ description: 'Reported GPS accuracy in meters' }),
});
export type UpdateLocationDto = z.infer<typeof UpdateLocationSchema>;
