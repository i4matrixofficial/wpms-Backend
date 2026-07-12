import { MigrationInterface, QueryRunner } from "typeorm";

export class UniquePasswordResetUserId1783841282473 implements MigrationInterface {
    name = 'UniquePasswordResetUserId1783841282473'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_d95569f623f28a0bf034a55099"`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_d95569f623f28a0bf034a55099" ON "password_resets"  ("userId") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_d95569f623f28a0bf034a55099"`);
        await queryRunner.query(`CREATE INDEX "IDX_d95569f623f28a0bf034a55099" ON "password_resets" USING btree ("userId") `);
    }

}
