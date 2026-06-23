import { MigrationInterface, QueryRunner } from "typeorm";

export class AddWorkers1782153663236 implements MigrationInterface {
    name = 'AddWorkers1782153663236'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "workers" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "fullName" character varying NOT NULL, "isAvailable" boolean NOT NULL DEFAULT false, "rating" numeric(3,2) NOT NULL DEFAULT '0', "user_id" uuid, CONSTRAINT "REL_e47e873d6f19443891cca73bd8" UNIQUE ("user_id"), CONSTRAINT "PK_e950c9aba3bd84a4f193058d838" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "worker_locations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "location" geography(Point,4326) NOT NULL, "lastPingAt" TIMESTAMP WITH TIME ZONE, "worker_id" uuid, CONSTRAINT "REL_95c9f565df04c36e6f46d6e868" UNIQUE ("worker_id"), CONSTRAINT "PK_217762e1004266ddfe1b0e484d7" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_worker_location_gist" ON "worker_locations" USING gist ("location") `);
        await queryRunner.query(`ALTER TABLE "workers" ADD CONSTRAINT "FK_e47e873d6f19443891cca73bd8c" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "worker_locations" ADD CONSTRAINT "FK_95c9f565df04c36e6f46d6e8682" FOREIGN KEY ("worker_id") REFERENCES "workers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "worker_locations" DROP CONSTRAINT "FK_95c9f565df04c36e6f46d6e8682"`);
        await queryRunner.query(`ALTER TABLE "workers" DROP CONSTRAINT "FK_e47e873d6f19443891cca73bd8c"`);
        await queryRunner.query(`DROP INDEX "public"."idx_worker_location_gist"`);
        await queryRunner.query(`DROP TABLE "worker_locations"`);
        await queryRunner.query(`DROP TABLE "workers"`);
    }

}
