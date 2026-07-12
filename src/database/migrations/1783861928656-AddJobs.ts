import { MigrationInterface, QueryRunner } from "typeorm";

export class AddJobs1783861928656 implements MigrationInterface {
    name = 'AddJobs1783861928656'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_0ec0f610530ec1a7cbe135e02e"`);
        await queryRunner.query(`ALTER TABLE "jobs" DROP COLUMN "serviceType"`);
        await queryRunner.query(`DROP TYPE "public"."jobs_servicetype_enum"`);
        await queryRunner.query(`ALTER TABLE "jobs" ADD "serviceTypeId" uuid NOT NULL`);
        await queryRunner.query(`ALTER TABLE "jobs" ADD "quantity" numeric(10,2)`);
        await queryRunner.query(`ALTER TABLE "jobs" ADD "estimatedPrice" numeric(10,2)`);
        await queryRunner.query(`ALTER TABLE "jobs" ADD "finalPrice" numeric(10,2)`);
        await queryRunner.query(`ALTER TABLE "jobs" ADD "service_type_id" uuid`);
        await queryRunner.query(`CREATE INDEX "IDX_09a1a5e026e291890f87ca51bf" ON "jobs"  ("serviceTypeId") `);
        await queryRunner.query(`ALTER TABLE "jobs" ADD CONSTRAINT "FK_816683a9ab02121497601a16252" FOREIGN KEY ("service_type_id") REFERENCES "service_types"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "jobs" DROP CONSTRAINT "FK_816683a9ab02121497601a16252"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_09a1a5e026e291890f87ca51bf"`);
        await queryRunner.query(`ALTER TABLE "jobs" DROP COLUMN "service_type_id"`);
        await queryRunner.query(`ALTER TABLE "jobs" DROP COLUMN "finalPrice"`);
        await queryRunner.query(`ALTER TABLE "jobs" DROP COLUMN "estimatedPrice"`);
        await queryRunner.query(`ALTER TABLE "jobs" DROP COLUMN "quantity"`);
        await queryRunner.query(`ALTER TABLE "jobs" DROP COLUMN "serviceTypeId"`);
        await queryRunner.query(`CREATE TYPE "public"."jobs_servicetype_enum" AS ENUM('plumbing', 'electrical', 'cleaning', 'carpentry', 'painting')`);
        await queryRunner.query(`ALTER TABLE "jobs" ADD "serviceType" "public"."jobs_servicetype_enum" NOT NULL`);
        await queryRunner.query(`CREATE INDEX "IDX_0ec0f610530ec1a7cbe135e02e" ON "jobs" USING btree ("serviceType") `);
    }

}
