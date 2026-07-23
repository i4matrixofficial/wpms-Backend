import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPayments1784793221148 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."payments_status_enum" AS ENUM('pending', 'succeeded', 'failed', 'refunded')`,
    );
    await queryRunner.query(
      `CREATE TABLE "payments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "jobId" uuid NOT NULL,
        "customerId" uuid NOT NULL,
        "amount" numeric(10,2) NOT NULL,
        "currency" character varying NOT NULL DEFAULT 'LKR',
        "status" "public"."payments_status_enum" NOT NULL DEFAULT 'pending',
        "gatewayProvider" character varying NOT NULL,
        "gatewayReference" character varying,
        "failureReason" text,
        "paidAt" TIMESTAMP WITH TIME ZONE,
        "refundedAt" TIMESTAMP WITH TIME ZONE,
        "refundReason" text,
        CONSTRAINT "PK_payments_id" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_payments_jobId" ON "payments" ("jobId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_payments_customerId" ON "payments" ("customerId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_payments_status" ON "payments" ("status")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_payments_status"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_payments_customerId"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_payments_jobId"`);
    await queryRunner.query(`DROP TABLE "payments"`);
    await queryRunner.query(`DROP TYPE "public"."payments_status_enum"`);
  }
}
