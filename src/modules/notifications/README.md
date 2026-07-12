# Notifications Module

In-app notification persistence for WPMS. **DB save only** — push delivery is reserved for a later phase (`pushedAt` stays `null` for now).

## Overview

When another feature needs to notify a user, it calls `NotificationsService` with:

1. `userId` — recipient  
2. `type` — one of the `NotificationType` enum values  
3. `data` — fields required by that type’s template  

The service validates `data`, builds `title` / `body` from mock templates, and saves a row in PostgreSQL.

## Folder layout

```
src/modules/notifications/
├── constants/notification-templates.ts   # mock copy + Zod required-data schemas
├── dto/create-notification.dto.ts        # create / list request schemas
├── entities/notification.entity.ts       # TypeORM entity
├── enums/notification-type.enum.ts       # notification types
├── notifications.controller.ts           # HTTP API
├── notifications.module.ts
└── notifications.service.ts              # create / list / mark read
```

Related:

- `src/common/entities/base.entity.ts` — shared `id`, `createdAt`, `updatedAt`
- `src/database/migrations/1752300000000-CreateNotifications.ts` — table + enum migration

## Notification types

| Enum value | Purpose |
|---|---|
| `SUCCESSFUL_REGISTRATION` | New account created |
| `WORKER_ACCOUNT_VERIFICATION` | Worker verify status (`approved` / `rejected` / `pending`) |
| `NEW_BOOKING_REQUEST` | Worker receives a new booking |
| `BOOKING_ACCEPTED` | Customer: booking accepted |
| `BOOKING_REJECTED` | Customer: booking rejected |
| `BOOKING_REMINDER` | ~24h reminder (customer and/or worker) |
| `PAYMENT_CONFIRMATION` | Payment succeeded |
| `SERVICE_COMPLETION` | Service marked complete |
| `COMPLAINT_STATUS_UPDATE` | Complaint status changed |
| `CUSTOMER_REVIEW` | Worker receives a rating/review |
| `SYSTEM_ANNOUNCEMENT` | Important system message |
| `PROMOTIONAL_ANNOUNCEMENT` | Promo / marketing message |

## Required `data` per type

Templates live in `constants/notification-templates.ts`. Placeholders use `{{fieldName}}`.

| Type | Required fields | Optional |
|---|---|---|
| `SUCCESSFUL_REGISTRATION` | `userName` | — |
| `WORKER_ACCOUNT_VERIFICATION` | `workerName`, `status` (`approved` \| `rejected` \| `pending`) | — |
| `NEW_BOOKING_REQUEST` | `bookingId` (uuid), `customerName`, `serviceName`, `scheduledAt` | — |
| `BOOKING_ACCEPTED` | `bookingId`, `workerName`, `serviceName`, `scheduledAt` | — |
| `BOOKING_REJECTED` | `bookingId`, `workerName`, `serviceName`, `scheduledAt` | — |
| `BOOKING_REMINDER` | `bookingId`, `serviceName`, `scheduledAt`, `recipientRole` (`customer` \| `worker`) | — |
| `PAYMENT_CONFIRMATION` | `paymentId`, `bookingId`, `amount` | `currency` (default `LKR`) |
| `SERVICE_COMPLETION` | `bookingId`, `serviceName`, `completedAt` | — |
| `COMPLAINT_STATUS_UPDATE` | `complaintId`, `status` | `note` |
| `CUSTOMER_REVIEW` | `bookingId`, `rating` (1–5) | `customerName`, `reviewPreview` |
| `SYSTEM_ANNOUNCEMENT` | `title`, `message` | — |
| `PROMOTIONAL_ANNOUNCEMENT` | `title`, `message` | `promoCode` |

Invalid `data` for a type returns **400** with field-level Zod errors.

## Database

Table: `notifications`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `userId` | uuid | recipient (indexed; FK to `users` can be added later) |
| `type` | `notification_type_enum` | see types above |
| `title` | varchar(255) | rendered from template |
| `body` | text | rendered from template |
| `data` | jsonb | validated payload used to build the message |
| `isRead` | boolean | default `false` |
| `pushedAt` | timestamptz \| null | reserved for future push; currently always `null` |
| `createdAt` / `updatedAt` | timestamptz | from `BaseEntity` |

### Run migration

```bash
# DATABASE_URL must be set (see .env.example)
npm run migration:run
```

Revert:

```bash
npm run migration:revert
```

## HTTP API

Global prefix: `v1` → base path `/v1/notifications`

Response envelope (global interceptor):

```json
{
  "success": true,
  "data": { ... },
  "timestamp": "..."
}
```

### Create notification

`POST /v1/notifications`

```json
{
  "userId": "11111111-1111-1111-1111-111111111111",
  "type": "NEW_BOOKING_REQUEST",
  "data": {
    "bookingId": "22222222-2222-2222-2222-222222222222",
    "customerName": "Nethushi",
    "serviceName": "Plumbing",
    "scheduledAt": "2026-07-13 10:00"
  }
}
```

### List notifications for a user

`GET /v1/notifications?userId=<uuid>&unreadOnly=true&limit=20&offset=0`

| Query | Required | Default |
|---|---|---|
| `userId` | yes | — |
| `unreadOnly` | no | all |
| `limit` | no | `20` (max 100) |
| `offset` | no | `0` |

### Mark one as read

`PATCH /v1/notifications/:id/read?userId=<uuid>`

### Mark all as read

`PATCH /v1/notifications/read-all?userId=<uuid>`

> Auth guards are not wired yet. Endpoints currently take `userId` explicitly. Once JWT auth is ready, switch to the current-user decorator and drop `userId` from the query/body where appropriate.

## Using from other modules

`NotificationsModule` exports `NotificationsService`.

```ts
// In another module
imports: [NotificationsModule]

// In a service
await this.notificationsService.notify(userId, NotificationType.PAYMENT_CONFIRMATION, {
  paymentId: 'pay_123',
  bookingId: booking.id,
  amount: 2500,
  currency: 'LKR',
});
```

`create(dto)` and `notify(userId, type, data)` are equivalent entry points.

## Out of scope (later)

- Push / FCM / APNs delivery (update `pushedAt` when sent)
- Foreign key from `notifications.userId` → `users.id`
- Auth-protected routes (current user only)
- Scheduled job for `BOOKING_REMINDER` (24h before appointment)
- Admin broadcast for system/promo announcements

## Example mock bodies

| Type | Example body |
|---|---|
| Registration | `Hi Nethushi, your account has been created successfully...` |
| New booking | `You have a new booking request from Kasun for Plumbing on 2026-07-13 10:00.` |
| Reminder | `Reminder: your Plumbing appointment is scheduled for ... (about 24 hours from now).` |
| Payment | `Your payment of 2500 LKR for booking <uuid> was successful.` |
