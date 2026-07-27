# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

WPMS (Worker Platform Management System) — a NestJS + TypeORM + PostgreSQL/PostGIS backend for an
on-demand service marketplace (think: customers request jobs, verified workers accept/complete them,
payments and payouts settle automatically). Mobile-first API, versioned under `/v1`, documented at `/docs`
(Swagger).

## Commands

```bash
npm run start:dev          # dev server, watch mode
npm run build               # nest build
npm run lint                 # eslint --fix on src/apps/libs/test
npm run format                # prettier --write

npm run test                  # unit tests (jest, rootDir src, *.spec.ts)
npm run test -- path/to/file.spec.ts   # single test file
npm run test:watch
npm run test:cov
npm run test:e2e              # e2e tests (test/*.e2e-spec.ts)

npm run migration:generate    # generate a TypeORM migration from entity changes (-d src/database/data-source.ts)
npm run migration:run
npm run migration:revert
npm run seed                   # ts-node src/database/seeds/seed.ts
```

Local infra (Postgres+PostGIS, MinIO for S3-compatible storage, Mailpit for SMTP capture) is defined in
`docker-compose.yml`. Env vars are validated at boot by `src/config/env.schema.ts` (zod) — the app refuses
to start if `.env` is invalid or incomplete; see `.env.example` for the full list.

## Architecture

### Request pipeline
- Global prefix `v1`, global `ResponseInterceptor` (wraps all success responses as
  `{ success, data, timestamp }`) and `AllExceptionsFilter` (wraps all errors as
  `{ success: false, error: { code, message, details } }`).
- Validation uses **Zod**, not class-validator. DTOs are zod schemas (`XSchema`) plus an inferred type
  (`XDto`) in the same `dto/*.dto.ts` file. Apply with `@Body(new ZodValidationPipe(XSchema))` on the
  controller method param, and `@ZodApiBody(XSchema)` (or `ZodBody`) for Swagger docs generated from the
  same schema — schema is the single source of truth for both validation and API docs.

### Auth & authorization (`src/modules/auth`, `src/common/guards`, `src/common/decorators`)
- JWT access + refresh tokens (`@nestjs/jwt`, `argon2` for hashing). `JwtAuthGuard` and `RolesGuard` are
  registered globally via `APP_GUARD` in `AuthModule` — every route is authenticated by default; opt out
  with `@Public()`.
- **Roles vs. active mode**: a `User` can hold multiple `roles` (`admin` / `worker` / `customer`) but
  operates in one `activeMode` at a time, encoded in the JWT and switched via `POST /auth/switch-mode`.
  `@Roles(...)` gates on active mode (worker mode also re-checks verification status server-side, defense
  in depth). `@IdentityRoles(...)` gates on role *possession* only, ignoring active mode — used for
  onboarding endpoints (e.g. uploading verification docs) a user must reach before they can switch into
  that mode. Don't confuse the two decorators.
- Endpoints scoped to "my stuff" (e.g. `GET /jobs/mine`) filter by the caller's `activeMode`, not their
  roles — a dual-role user only sees one side of the marketplace at a time and must switch modes to see
  the other.
- Worker verification is a state machine of its own (`WorkerStatus`: unverified → pending → verified /
  rejected), separate from the job state machine.

### Jobs (`src/modules/jobs`)
- Explicit state machine in `job-state.machine.ts` (`TRANSITIONS` map + `assertTransition`) — always check
  this file before adding a new job status or transition; illegal transitions throw `BadRequestException`.
- `accept()` is a race-safe broadcast claim: multiple workers can see a REQUESTED job, but the DB update is
  conditioned on `status = REQUESTED AND not expired` in a single `UPDATE ... WHERE`, so only the first
  caller wins (`affected === 0` → 409).
- Immediate jobs auto-expire after 15 minutes (`IMMEDIATE_EXPIRY_MIN`); a `@Cron(EVERY_MINUTE)` job
  (`expireStaleJobs`) sweeps stale REQUESTED rows to EXPIRED. Scheduled jobs don't expire this way.
- Pricing: `priceTiming` on the `ServiceType` decides whether `estimatedPrice` is computed at job creation
  (`upfront`) or left null until completion (`on_completion`).
- Location is a PostGIS `geography(Point, 4326)` column; nearby-search (`findNearby`) uses
  `ST_DWithin`/`ST_Distance` raw SQL via query builder, joined manually against `service_types` on the
  always-populated `serviceTypeId` column rather than the ORM relation (which can be stale on old rows).
- Job completion/cancellation don't touch payments directly — they emit `JOB_COMPLETED` / `JOB_CANCELLED`
  events (`jobs.events.ts`) that `PaymentsService` listens for. Keep this decoupling: Jobs never imports
  Payments.

### Payments & payouts (`src/modules/payments`)
- `PaymentGateway` is an interface (`gateways/payment-gateway.interface.ts`) injected via the
  `PAYMENT_GATEWAY` token; `MockPaymentGateway` is the only implementation today (a real provider like
  PayHere plugs in later without touching `PaymentsService`/`PaymentsController`). The mock deterministically
  declines any charge whose amount ends in `.13` — use that in tests that need a failure path.
  `PAYMENT_GATEWAY_PROVIDER` env var selects the provider.
  - Two payment methods: `ONLINE` (via gateway) and `CASH` (worker attests an off-app payment via
    `payCash`; no gateway call, but same idempotency/pricing rules as online).
  - Settlement is **event-driven**, reacting to `JOB_COMPLETED` (pays the worker out, minus
    `PLATFORM_COMMISSION_PERCENT`) and `JOB_CANCELLED` (splits refund vs. worker payout based on whether
    work had started and who cancelled — see `settleCancellation` for the exact policy, tunable via
    `CANCEL_INPROGRESS_REFUND_PERCENT`). These handlers **must never throw** — a settlement failure is
    logged for manual admin reconciliation, not rolled back into the job transition that already
    committed. Follow this pattern for any new event listener in this module.
  - Payouts only exist for online-paid jobs; cash settles hand-to-hand, so no `Payout` row is created.

### Entities & database
- All entities extend `BaseEntity` (`src/common/entities/base.entity.ts`): UUID PK + `createdAt`/`updatedAt`
  timestamptz columns.
- `synchronize: false` always — schema changes go through TypeORM migrations
  (`src/database/migrations/`, generated against `src/database/data-source.ts`). `DatabaseModule` uses
  `autoLoadEntities: true` at runtime; the standalone `data-source.ts` (used by the CLI) globs
  `src/**/*.entity.ts` directly.
- Money columns are `numeric(10,2)`; round with the `round2` helper pattern used in `PaymentsService`
  rather than relying on float arithmetic.

### Module layout
Each domain lives under `src/modules/<name>/` with `*.controller.ts`, `*.service.ts`, `*.module.ts`,
`dto/*.dto.ts` (zod schema + type), `entities/*.entity.ts`. Cross-module reads go through the other
module's service (e.g. `JobsService` calls `WorkersService`/`ServiceTypesService`); cross-module reactions
to state changes go through `EventEmitterModule` events instead of direct calls (see Jobs → Payments above)
to keep write paths decoupled.
