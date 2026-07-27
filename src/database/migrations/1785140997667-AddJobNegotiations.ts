import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddJobNegotiations1785140997667 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // customer's non-binding budget hint on negotiable jobs
    await queryRunner.query(
      `ALTER TABLE "jobs" ADD "customerBudget" numeric(10,2)`,
    );

    await queryRunner.query(
      `CREATE TYPE "public"."job_negotiations_status_enum" AS ENUM('open', 'accepted', 'declined', 'withdrawn', 'superseded', 'expired')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."job_negotiations_lastproposedby_enum" AS ENUM('customer', 'worker')`,
    );
    await queryRunner.query(
      `CREATE TABLE "job_negotiations" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "jobId" uuid NOT NULL,
        "workerId" uuid NOT NULL,
        "status" "public"."job_negotiations_status_enum" NOT NULL DEFAULT 'open',
        "currentPrice" numeric(10,2) NOT NULL,
        "lastProposedBy" "public"."job_negotiations_lastproposedby_enum" NOT NULL,
        "closedAt" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_job_negotiations_id" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_job_negotiations_jobId" ON "job_negotiations" ("jobId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_job_negotiations_workerId" ON "job_negotiations" ("workerId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_job_negotiations_status" ON "job_negotiations" ("status")`,
    );
    // enforces "one open negotiation per (job, worker)" at the DB level —
    // the service layer also pre-checks this, but that check-then-insert is
    // racy under concurrent requests, so this partial unique index is the
    // real guard
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_job_negotiations_open_per_worker" ON "job_negotiations" ("jobId", "workerId") WHERE "status" = 'open'`,
    );

    await queryRunner.query(
      `CREATE TYPE "public"."job_offers_proposedby_enum" AS ENUM('customer', 'worker')`,
    );
    await queryRunner.query(
      `CREATE TABLE "job_offers" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "negotiationId" uuid NOT NULL,
        "price" numeric(10,2) NOT NULL,
        "proposedBy" "public"."job_offers_proposedby_enum" NOT NULL,
        "message" text,
        CONSTRAINT "PK_job_offers_id" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_job_offers_negotiationId" ON "job_offers" ("negotiationId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_job_offers_negotiationId"`,
    );
    await queryRunner.query(`DROP TABLE "job_offers"`);
    await queryRunner.query(`DROP TYPE "public"."job_offers_proposedby_enum"`);

    await queryRunner.query(
      `DROP INDEX "public"."UQ_job_negotiations_open_per_worker"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_job_negotiations_status"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_job_negotiations_workerId"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_job_negotiations_jobId"`);
    await queryRunner.query(`DROP TABLE "job_negotiations"`);
    await queryRunner.query(
      `DROP TYPE "public"."job_negotiations_lastproposedby_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."job_negotiations_status_enum"`,
    );

    await queryRunner.query(`ALTER TABLE "jobs" DROP COLUMN "customerBudget"`);
  }
}
