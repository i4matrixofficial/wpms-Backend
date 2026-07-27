import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWorkerPayoutAccounts1785142302390
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "worker_payout_accounts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "workerId" uuid NOT NULL,
        "bankName" character varying NOT NULL,
        "accountHolderName" character varying NOT NULL,
        "accountNumber" character varying NOT NULL,
        "branchCode" character varying,
        CONSTRAINT "PK_worker_payout_accounts_id" PRIMARY KEY ("id")
      )`,
    );
    // one bank account on file per worker — setPayoutAccount() upserts against this
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_worker_payout_accounts_workerId" ON "worker_payout_accounts" ("workerId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."UQ_worker_payout_accounts_workerId"`,
    );
    await queryRunner.query(`DROP TABLE "worker_payout_accounts"`);
  }
}
