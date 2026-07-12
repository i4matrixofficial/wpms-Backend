import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateComplaints1752301000000 implements MigrationInterface {
  name = 'CreateComplaints1752301000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "complaint_status_enum" AS ENUM (
        'PENDING',
        'UNDER_REVIEW',
        'RESOLVED'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "complaints" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "userId" uuid NOT NULL,
        "againstUserId" uuid NOT NULL,
        "bookingId" uuid NOT NULL,
        "description" text NOT NULL,
        "status" "complaint_status_enum" NOT NULL DEFAULT 'PENDING',
        "adminNote" text,
        CONSTRAINT "PK_complaints_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_complaints_userId" ON "complaints" ("userId")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_complaints_againstUserId" ON "complaints" ("againstUserId")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_complaints_bookingId" ON "complaints" ("bookingId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_complaints_bookingId"`);
    await queryRunner.query(`DROP INDEX "IDX_complaints_againstUserId"`);
    await queryRunner.query(`DROP INDEX "IDX_complaints_userId"`);
    await queryRunner.query(`DROP TABLE "complaints"`);
    await queryRunner.query(`DROP TYPE "complaint_status_enum"`);
  }
}
