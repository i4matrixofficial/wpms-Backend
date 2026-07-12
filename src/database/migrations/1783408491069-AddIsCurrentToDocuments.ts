import { MigrationInterface, QueryRunner } from "typeorm";

export class AddIsCurrentToDocuments1783408491069 implements MigrationInterface {
    name = 'AddIsCurrentToDocuments1783408491069'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "worker_documents" ADD "isCurrent" boolean NOT NULL DEFAULT true`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "worker_documents" DROP COLUMN "isCurrent"`);
    }

}
