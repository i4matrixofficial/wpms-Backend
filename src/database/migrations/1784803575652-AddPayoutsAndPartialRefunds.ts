import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPayoutsAndPartialRefunds1784803575652 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // payments: track partial refunds
    await queryRunner.query(
      `ALTER TYPE "public"."payments_status_enum" ADD VALUE IF NOT EXISTS 'partially_refunded' BEFORE 'refunded'`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" ADD "refundedAmount" numeric(10,2) NOT NULL DEFAULT 0`,
    );

    // payouts: money paid out to workers
    await queryRunner.query(
      `CREATE TYPE "public"."payouts_status_enum" AS ENUM('pending', 'paid', 'failed')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."payouts_reason_enum" AS ENUM('job_completed', 'cancellation_fee')`,
    );
    await queryRunner.query(
      `CREATE TABLE "payouts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "jobId" uuid NOT NULL,
        "workerId" uuid NOT NULL,
        "paymentId" uuid NOT NULL,
        "grossAmount" numeric(10,2) NOT NULL,
        "commissionAmount" numeric(10,2) NOT NULL,
        "netAmount" numeric(10,2) NOT NULL,
        "currency" character varying NOT NULL DEFAULT 'LKR',
        "status" "public"."payouts_status_enum" NOT NULL DEFAULT 'pending',
        "reason" "public"."payouts_reason_enum" NOT NULL,
        "gatewayProvider" character varying,
        "gatewayReference" character varying,
        "failureReason" text,
        "paidAt" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_payouts_id" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_payouts_jobId" ON "payouts" ("jobId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_payouts_workerId" ON "payouts" ("workerId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_payouts_status" ON "payouts" ("status")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_payouts_status"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_payouts_workerId"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_payouts_jobId"`);
    await queryRunner.query(`DROP TABLE "payouts"`);
    await queryRunner.query(`DROP TYPE "public"."payouts_reason_enum"`);
    await queryRunner.query(`DROP TYPE "public"."payouts_status_enum"`);
    await queryRunner.query(
      `ALTER TABLE "payments" DROP COLUMN "refundedAmount"`,
    );
    // NOTE: Postgres can't drop a single enum value; leaving
    // 'partially_refunded' on payments_status_enum is harmless on rollback.
  }
}
