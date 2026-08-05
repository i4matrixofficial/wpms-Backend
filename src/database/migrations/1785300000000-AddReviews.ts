import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReviews1785300000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."reviews_direction_enum" AS ENUM('customer_to_worker', 'worker_to_customer')`,
    );
    await queryRunner.query(
      `CREATE TABLE "reviews" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "jobId" uuid NOT NULL,
        "reviewerId" uuid NOT NULL,
        "revieweeId" uuid NOT NULL,
        "direction" "public"."reviews_direction_enum" NOT NULL,
        "rating" integer NOT NULL,
        "comment" text,
        "isHidden" boolean NOT NULL DEFAULT false,
        "hiddenReason" text,
        "deletedAt" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_reviews_id" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_reviews_rating" CHECK ("rating" BETWEEN 1 AND 5)
      )`,
    );
    // one *live* review per person per job — the write path relies on this
    // index rather than a read-then-write check to settle concurrent submits.
    // Partial on deletedAt so a withdrawn review releases the slot instead of
    // locking the author out of ever reviewing that job again.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_reviews_job_reviewer" ON "reviews" ("jobId", "reviewerId") WHERE "deletedAt" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_reviews_jobId" ON "reviews" ("jobId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_reviews_reviewerId" ON "reviews" ("reviewerId")`,
    );
    // profile feeds and the rating aggregates both read by reviewee
    await queryRunner.query(
      `CREATE INDEX "IDX_reviews_revieweeId" ON "reviews" ("revieweeId")`,
    );

    await queryRunner.query(
      `ALTER TABLE "workers" ADD "ratingCount" integer NOT NULL DEFAULT 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "workers" DROP COLUMN "ratingCount"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_reviews_revieweeId"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_reviews_reviewerId"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_reviews_jobId"`);
    await queryRunner.query(`DROP INDEX "public"."UQ_reviews_job_reviewer"`);
    await queryRunner.query(`DROP TABLE "reviews"`);
    await queryRunner.query(`DROP TYPE "public"."reviews_direction_enum"`);
  }
}
