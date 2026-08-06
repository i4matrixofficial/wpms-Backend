import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateNotifications1752300000000 implements MigrationInterface {
  name = 'CreateNotifications1752300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "notification_type_enum" AS ENUM (
        'SUCCESSFUL_REGISTRATION',
        'WORKER_ACCOUNT_VERIFICATION',
        'NEW_BOOKING_REQUEST',
        'BOOKING_ACCEPTED',
        'BOOKING_REJECTED',
        'BOOKING_REMINDER',
        'PAYMENT_CONFIRMATION',
        'SERVICE_COMPLETION',
        'COMPLAINT_STATUS_UPDATE',
        'CUSTOMER_REVIEW',
        'SYSTEM_ANNOUNCEMENT',
        'PROMOTIONAL_ANNOUNCEMENT'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "notifications" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "userId" uuid NOT NULL,
        "type" "notification_type_enum" NOT NULL,
        "title" character varying(255) NOT NULL,
        "body" text NOT NULL,
        "data" jsonb NOT NULL DEFAULT '{}',
        "isRead" boolean NOT NULL DEFAULT false,
        "pushedAt" TIMESTAMPTZ,
        CONSTRAINT "PK_notifications_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_notifications_userId" ON "notifications" ("userId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_notifications_userId"`);
    await queryRunner.query(`DROP TABLE "notifications"`);
    await queryRunner.query(`DROP TYPE "notification_type_enum"`);
  }
}
