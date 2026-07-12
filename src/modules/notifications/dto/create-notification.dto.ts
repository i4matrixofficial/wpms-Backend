import { z } from 'zod';
import { NotificationType } from '../enums/notification-type.enum';

export const CreateNotificationSchema = z.object({
  userId: z.string().uuid(),
  type: z.nativeEnum(NotificationType),
  data: z.record(z.string(), z.unknown()).default({}),
});

export type CreateNotificationDto = z.infer<typeof CreateNotificationSchema>;

export const ListNotificationsQuerySchema = z.object({
  userId: z.string().uuid(),
  unreadOnly: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .optional()
    .transform((v) => v === true || v === 'true'),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

export type ListNotificationsQueryDto = z.infer<
  typeof ListNotificationsQuerySchema
>;
