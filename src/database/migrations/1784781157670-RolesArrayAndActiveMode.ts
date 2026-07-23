import { MigrationInterface, QueryRunner } from 'typeorm';

export class RolesArrayAndActiveMode1784781157670 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // users: single "role" -> "roles" array
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "role"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."users_role_enum"`);
    await queryRunner.query(
      `CREATE TYPE "public"."users_roles_enum" AS ENUM('admin', 'worker', 'customer')`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "roles" "public"."users_roles_enum"[] NOT NULL DEFAULT '{customer}'`,
    );

    // refresh_tokens: remember which mode the session is in
    await queryRunner.query(
      `CREATE TYPE "public"."refresh_tokens_activemode_enum" AS ENUM('admin', 'worker', 'customer')`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" ADD "activeMode" "public"."refresh_tokens_activemode_enum" NOT NULL DEFAULT 'customer'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" DROP COLUMN "activeMode"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."refresh_tokens_activemode_enum"`,
    );
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "roles"`);
    await queryRunner.query(`DROP TYPE "public"."users_roles_enum"`);
    await queryRunner.query(
      `CREATE TYPE "public"."users_role_enum" AS ENUM('admin', 'worker', 'customer')`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "role" "public"."users_role_enum" NOT NULL DEFAULT 'customer'`,
    );
  }
}
