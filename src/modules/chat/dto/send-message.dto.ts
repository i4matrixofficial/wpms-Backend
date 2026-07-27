import { z } from 'zod';

export const SendMessageSchema = z.object({
  body: z.string().min(1).max(2000).meta({ description: 'Message text' }),
});
export type SendMessageDto = z.infer<typeof SendMessageSchema>;
