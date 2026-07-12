import { MigrationInterface, QueryRunner } from "typeorm";

export class AddWorkerDocuments1783406602714 implements MigrationInterface {
    name = 'AddWorkerDocuments1783406602714'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."workers_status_enum" AS ENUM('unverified', 'pending', 'verified', 'rejected')`);
        await queryRunner.query(`ALTER TABLE "workers" ADD "status" "public"."workers_status_enum" NOT NULL DEFAULT 'unverified'`);
        await queryRunner.query(`ALTER TABLE "workers" ALTER COLUMN "fullName" DROP NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "workers" ALTER COLUMN "fullName" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "workers" DROP COLUMN "status"`);
        await queryRunner.query(`DROP TYPE "public"."workers_status_enum"`);
    }

}
