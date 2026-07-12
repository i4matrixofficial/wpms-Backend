import { z } from 'zod';
export const SetActiveSchema = z.object({ isActive: z.boolean() });
export type SetActiveDto = z.infer<typeof SetActiveSchema>;
