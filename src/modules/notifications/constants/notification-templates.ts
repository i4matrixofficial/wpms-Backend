import { z } from 'zod';
import { NotificationType } from '../enums/notification-type.enum';

/**
 * Mock copy + required payload fields per notification type.
 * Placeholders use {{fieldName}} and are filled from `data` at create time.
 */
export const notificationTemplates = {
  [NotificationType.SUCCESSFUL_REGISTRATION]: {
    title: 'Welcome to WPMS',
    body: 'Hi {{userName}}, your account has been created successfully. You can now explore and book services.',
    requiredData: z.object({
      userName: z.string().min(1),
    }),
  },
  [NotificationType.WORKER_ACCOUNT_VERIFICATION]: {
    title: 'Worker account verification',
    body: 'Hi {{workerName}}, your worker account verification status is: {{status}}.',
    requiredData: z.object({
      workerName: z.string().min(1),
      status: z.enum(['approved', 'rejected', 'pending']),
    }),
  },
  [NotificationType.NEW_BOOKING_REQUEST]: {
    title: 'New booking request',
    body: 'You have a new booking request from {{customerName}} for {{serviceName}} on {{scheduledAt}}.',
    requiredData: z.object({
      bookingId: z.string().uuid(),
      customerName: z.string().min(1),
      serviceName: z.string().min(1),
      scheduledAt: z.string().min(1),
    }),
  },
  [NotificationType.BOOKING_ACCEPTED]: {
    title: 'Booking accepted',
    body: 'Good news! {{workerName}} accepted your booking for {{serviceName}} on {{scheduledAt}}.',
    requiredData: z.object({
      bookingId: z.string().uuid(),
      workerName: z.string().min(1),
      serviceName: z.string().min(1),
      scheduledAt: z.string().min(1),
    }),
  },
  [NotificationType.BOOKING_REJECTED]: {
    title: 'Booking rejected',
    body: 'Unfortunately, {{workerName}} rejected your booking for {{serviceName}} on {{scheduledAt}}.',
    requiredData: z.object({
      bookingId: z.string().uuid(),
      workerName: z.string().min(1),
      serviceName: z.string().min(1),
      scheduledAt: z.string().min(1),
    }),
  },
  [NotificationType.BOOKING_REMINDER]: {
    title: 'Upcoming service reminder',
    body: 'Reminder: your {{serviceName}} appointment is scheduled for {{scheduledAt}} (about 24 hours from now).',
    requiredData: z.object({
      bookingId: z.string().uuid(),
      serviceName: z.string().min(1),
      scheduledAt: z.string().min(1),
      recipientRole: z.enum(['customer', 'worker']),
    }),
  },
  [NotificationType.PAYMENT_CONFIRMATION]: {
    title: 'Payment confirmed',
    body: 'Your payment of {{amount}} {{currency}} for booking {{bookingId}} was successful.',
    requiredData: z.object({
      paymentId: z.string().min(1),
      bookingId: z.string().uuid(),
      amount: z.union([z.string(), z.number()]),
      currency: z.string().min(1).default('LKR'),
    }),
  },
  [NotificationType.SERVICE_COMPLETION]: {
    title: 'Service completed',
    body: 'Your {{serviceName}} service has been marked as completed on {{completedAt}}.',
    requiredData: z.object({
      bookingId: z.string().uuid(),
      serviceName: z.string().min(1),
      completedAt: z.string().min(1),
    }),
  },
  [NotificationType.COMPLAINT_STATUS_UPDATE]: {
    title: 'Complaint status update',
    body: 'Your complaint {{complaintId}} status is now: {{status}}.{{messageExtra}}',
    requiredData: z.object({
      complaintId: z.string().min(1),
      status: z.string().min(1),
      note: z.string().optional(),
    }),
  },
  [NotificationType.CUSTOMER_REVIEW]: {
    title: 'New customer review',
    body: 'You received a {{rating}}-star review{{customerNameSuffix}} for booking {{bookingId}}.',
    requiredData: z.object({
      bookingId: z.string().uuid(),
      rating: z.number().min(1).max(5),
      customerName: z.string().optional(),
      reviewPreview: z.string().optional(),
    }),
  },
  [NotificationType.SYSTEM_ANNOUNCEMENT]: {
    title: '{{title}}',
    body: '{{message}}',
    requiredData: z.object({
      title: z.string().min(1),
      message: z.string().min(1),
    }),
  },
  [NotificationType.PROMOTIONAL_ANNOUNCEMENT]: {
    title: '{{title}}',
    body: '{{message}}',
    requiredData: z.object({
      title: z.string().min(1),
      message: z.string().min(1),
      promoCode: z.string().optional(),
    }),
  },
} as const;

export type NotificationTemplateData<T extends NotificationType> = z.infer<
  (typeof notificationTemplates)[T]['requiredData']
>;

export function renderTemplate(
  template: string,
  data: Record<string, unknown>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const value = data[key];
    return value === undefined || value === null ? '' : String(value);
  });
}

/** Builds title/body and normalizes payload (e.g. review customer name suffix). */
export function buildNotificationContent(
  type: NotificationType,
  rawData: Record<string, unknown>,
): { title: string; body: string; data: Record<string, unknown> } {
  const template = notificationTemplates[type];
  const parsed = template.requiredData.safeParse(rawData);

  if (!parsed.success) {
    throw parsed.error;
  }

  const data: Record<string, unknown> = { ...parsed.data };

  if (type === NotificationType.CUSTOMER_REVIEW) {
    const customerName = data.customerName as string | undefined;
    data.customerNameSuffix = customerName ? ` from ${customerName}` : '';
  }

  if (type === NotificationType.COMPLAINT_STATUS_UPDATE) {
    const note = data.note as string | undefined;
    data.messageExtra = note ? ` Note: ${note}` : '';
  }

  return {
    title: renderTemplate(template.title, data),
    body: renderTemplate(template.body, data),
    data,
  };
}
