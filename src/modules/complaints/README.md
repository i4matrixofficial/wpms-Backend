# Complaints Module

PostgreSQL-backed complaint management for WPMS. Customers and workers can submit complaints; admins can review and resolve them.

## Schema mapping

| Spec field | DB / entity field | Type |
|---|---|---|
| ComplaintID | `id` | UUID |
| UserID | `userId` | UUID (complainant) |
| AgainstUserID | `againstUserId` | UUID (accused) |
| BookingID | `bookingId` | UUID |
| ComplaintDescription | `description` | text |
| Status | `status` | `PENDING` \| `UNDER_REVIEW` \| `RESOLVED` |
| *(extra)* | `adminNote` | text \| null (admin action note) |
| *(extra)* | `createdAt` / `updatedAt` | timestamptz |

## Status flow

```
PENDING → UNDER_REVIEW → RESOLVED
PENDING → RESOLVED
```

`RESOLVED` is terminal.

## Requirements covered

| Requirement | How |
|---|---|
| Customer complains about worker | `POST` with customer `userId` + worker `againstUserId` |
| Worker complains about customer | `POST` with worker `userId` + customer `againstUserId` |
| Admin reviews details | `GET /complaints`, `GET /complaints/:id` |
| Admin takes action | `PATCH /complaints/:id/status` |
| Records kept for reference | Persisted in `complaints` table |
| Admin notified on submit | Logged for now; wire `NotificationsModule` later |

## HTTP API (`/v1/complaints`)

### Submit complaint (Customer / Worker)

`POST /v1/complaints`

```json
{
  "userId": "11111111-1111-1111-1111-111111111111",
  "againstUserId": "22222222-2222-2222-2222-222222222222",
  "bookingId": "33333333-3333-3333-3333-333333333333",
  "description": "Worker did not arrive at the scheduled time and was unreachable."
}
```

Rules:
- `userId` ≠ `againstUserId`
- `description` length 10–5000
- Initial status: `PENDING`

### List complaints (Admin / self)

`GET /v1/complaints?userId=&againstUserId=&bookingId=&status=&limit=20&offset=0`

### Get one

`GET /v1/complaints/:id`

### Update status (Admin)

`PATCH /v1/complaints/:id/status`

```json
{
  "status": "UNDER_REVIEW",
  "adminNote": "Assigned to support for investigation"
}
```

or

```json
{
  "status": "RESOLVED",
  "adminNote": "Refund issued and worker warned"
}
```

## Migration

```bash
npm run migration:run
```

## Auth note

JWT auth / role guards are not wired yet (`AuthModule` not on disk). Endpoints currently accept `userId` in the body/query. Once auth is ready:

- Take complainant from `@CurrentUser()`
- Protect status updates with `@Roles(Role.ADMIN)`
- Restrict list/get to owner or admin

## Folder layout

```
src/modules/complaints/
├── complaints.controller.ts
├── complaints.module.ts
├── complaints.service.ts
├── dto/complaint.dto.ts
├── entities/complaint.entity.ts
├── enums/complaint-status.enum.ts
└── README.md
```
