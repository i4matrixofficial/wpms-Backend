import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddJobsLocationGistIndex1784791284062 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "IDX_jobs_location" ON "jobs" USING GIST ("location")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_jobs_location"`);
  }
}
