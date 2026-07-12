import { MigrationInterface, QueryRunner } from "typeorm";

export class AddFullNameToUsers1783834986356 implements MigrationInterface {
    name = 'AddFullNameToUsers1783834986356'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" ADD "fullName" character varying NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "fullName"`);
    }

}
