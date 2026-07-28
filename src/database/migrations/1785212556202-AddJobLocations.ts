import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddJobLocations1785212556202 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "job_locations" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "jobId" uuid NOT NULL,
        "workerId" uuid NOT NULL,
        "location" geography(Point,4326) NOT NULL,
        "accuracy" numeric(10,2),
        CONSTRAINT "PK_job_locations_id" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_job_locations_jobId" ON "job_locations" ("jobId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_job_locations_workerId" ON "job_locations" ("workerId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_job_locations_gist" ON "job_locations" USING GIST ("location")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."idx_job_locations_gist"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_job_locations_workerId"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_job_locations_jobId"`);
    await queryRunner.query(`DROP TABLE "job_locations"`);
  }
}
