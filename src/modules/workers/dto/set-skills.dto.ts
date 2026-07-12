import { z } from 'zod';

export const SetSkillsSchema = z.object({
  serviceTypeIds: z
    .array(z.uuid())
    .min(1)
    .max(20)
    .meta({ description: 'The service type ids this worker offers' }),
});
export type SetSkillsDto = z.infer<typeof SetSkillsSchema>;
