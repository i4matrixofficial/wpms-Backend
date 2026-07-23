import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCashPayments1784794432790 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."payments_method_enum" AS ENUM('online', 'cash')`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" ADD "method" "public"."payments_method_enum" NOT NULL DEFAULT 'online'`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" ALTER COLUMN "gatewayProvider" DROP NOT NULL`,
    );
    await queryRunner.query(`ALTER TABLE "payments" ADD "confirmedBy" uuid`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN "confirmedBy"`);
    await queryRunner.query(
      `ALTER TABLE "payments" ALTER COLUMN "gatewayProvider" SET NOT NULL`,
    );
    await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN "method"`);
    await queryRunner.query(`DROP TYPE "public"."payments_method_enum"`);
  }
}
