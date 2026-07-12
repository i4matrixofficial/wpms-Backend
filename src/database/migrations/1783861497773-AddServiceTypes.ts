import { MigrationInterface, QueryRunner } from "typeorm";

export class AddServiceTypes1783861497773 implements MigrationInterface {
    name = 'AddServiceTypes1783861497773'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."jobs_servicetype_enum" AS ENUM('plumbing', 'electrical', 'cleaning', 'carpentry', 'painting')`);
        await queryRunner.query(`CREATE TYPE "public"."jobs_status_enum" AS ENUM('requested', 'accepted', 'in_progress', 'completed', 'cancelled', 'expired')`);
        await queryRunner.query(`CREATE TYPE "public"."jobs_type_enum" AS ENUM('immediate', 'scheduled')`);
        await queryRunner.query(`CREATE TABLE "jobs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "customerId" uuid NOT NULL, "workerId" uuid, "serviceType" "public"."jobs_servicetype_enum" NOT NULL, "status" "public"."jobs_status_enum" NOT NULL DEFAULT 'requested', "type" "public"."jobs_type_enum" NOT NULL, "location" geography(Point,4326) NOT NULL, "description" text, "scheduledAt" TIMESTAMP WITH TIME ZONE, "expiresAt" TIMESTAMP WITH TIME ZONE, "acceptedAt" TIMESTAMP WITH TIME ZONE, "startedAt" TIMESTAMP WITH TIME ZONE, "completedAt" TIMESTAMP WITH TIME ZONE, "cancelledAt" TIMESTAMP WITH TIME ZONE, "cancellationReason" text, CONSTRAINT "PK_cf0a6c42b72fcc7f7c237def345" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_15be39eec1b46b46690fd5460d" ON "jobs"  ("customerId") `);
        await queryRunner.query(`CREATE INDEX "IDX_b003c3e96d524079907b0248c7" ON "jobs"  ("workerId") `);
        await queryRunner.query(`CREATE INDEX "IDX_0ec0f610530ec1a7cbe135e02e" ON "jobs"  ("serviceType") `);
        await queryRunner.query(`CREATE INDEX "IDX_a0c30e3eb9649fe7fbcd336a63" ON "jobs"  ("status") `);
        await queryRunner.query(`CREATE TYPE "public"."service_types_pricingmodel_enum" AS ENUM('flat', 'per_unit')`);
        await queryRunner.query(`CREATE TYPE "public"."service_types_unit_enum" AS ENUM('hour', 'square_meter', 'room', 'unit', 'flat')`);
        await queryRunner.query(`CREATE TYPE "public"."service_types_pricetiming_enum" AS ENUM('upfront', 'on_completion')`);
        await queryRunner.query(`CREATE TABLE "service_types" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "name" character varying NOT NULL, "displayName" character varying NOT NULL, "pricingModel" "public"."service_types_pricingmodel_enum" NOT NULL, "unit" "public"."service_types_unit_enum" NOT NULL, "baseRate" numeric(10,2) NOT NULL, "priceTiming" "public"."service_types_pricetiming_enum" NOT NULL, "isActive" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_1dc93417a097cdee3491f39d7cc" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_7dadebaed69653520aa93bbc84" ON "service_types"  ("name") `);
        await queryRunner.query(`CREATE TABLE "worker_skills" ("workersId" uuid NOT NULL, "serviceTypesId" uuid NOT NULL, CONSTRAINT "PK_7a693ced4d0289ba3ef7d6c2bda" PRIMARY KEY ("workersId", "serviceTypesId"))`);
        await queryRunner.query(`CREATE INDEX "IDX_317d9e42de8987b3b4543728a3" ON "worker_skills"  ("workersId") `);
        await queryRunner.query(`CREATE INDEX "IDX_12d2230638d6607d26182db640" ON "worker_skills"  ("serviceTypesId") `);
        await queryRunner.query(`ALTER TABLE "worker_skills" ADD CONSTRAINT "FK_317d9e42de8987b3b4543728a35" FOREIGN KEY ("workersId") REFERENCES "workers"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "worker_skills" ADD CONSTRAINT "FK_12d2230638d6607d26182db640a" FOREIGN KEY ("serviceTypesId") REFERENCES "service_types"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "worker_skills" DROP CONSTRAINT "FK_12d2230638d6607d26182db640a"`);
        await queryRunner.query(`ALTER TABLE "worker_skills" DROP CONSTRAINT "FK_317d9e42de8987b3b4543728a35"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_12d2230638d6607d26182db640"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_317d9e42de8987b3b4543728a3"`);
        await queryRunner.query(`DROP TABLE "worker_skills"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_7dadebaed69653520aa93bbc84"`);
        await queryRunner.query(`DROP TABLE "service_types"`);
        await queryRunner.query(`DROP TYPE "public"."service_types_pricetiming_enum"`);
        await queryRunner.query(`DROP TYPE "public"."service_types_unit_enum"`);
        await queryRunner.query(`DROP TYPE "public"."service_types_pricingmodel_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_a0c30e3eb9649fe7fbcd336a63"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_0ec0f610530ec1a7cbe135e02e"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_b003c3e96d524079907b0248c7"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_15be39eec1b46b46690fd5460d"`);
        await queryRunner.query(`DROP TABLE "jobs"`);
        await queryRunner.query(`DROP TYPE "public"."jobs_type_enum"`);
        await queryRunner.query(`DROP TYPE "public"."jobs_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."jobs_servicetype_enum"`);
    }

}
