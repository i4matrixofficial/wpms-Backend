import { z } from 'zod';

export const BlockUserSchema = z.object({
  userId: z.string().uuid().meta({ description: 'User to block' }),
});
export type BlockUserDto = z.infer<typeof BlockUserSchema>;
