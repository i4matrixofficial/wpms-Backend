import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddChatMessages1785143452710 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."chat_messages_type_enum" AS ENUM('text', 'image', 'system')`,
    );
    await queryRunner.query(
      `CREATE TABLE "chat_messages" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "jobId" uuid NOT NULL,
        "senderId" uuid,
        "type" "public"."chat_messages_type_enum" NOT NULL DEFAULT 'text',
        "body" text,
        "attachmentKey" character varying,
        "attachmentMimeType" character varying,
        "attachmentSize" integer,
        "deliveredAt" TIMESTAMP WITH TIME ZONE,
        "readAt" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_chat_messages_id" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_chat_messages_jobId" ON "chat_messages" ("jobId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_chat_messages_senderId" ON "chat_messages" ("senderId")`,
    );

    await queryRunner.query(
      `CREATE TABLE "chat_blocks" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "blockerId" uuid NOT NULL,
        "blockedId" uuid NOT NULL,
        CONSTRAINT "PK_chat_blocks_id" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_chat_blocks_blockerId_blockedId" ON "chat_blocks" ("blockerId", "blockedId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."UQ_chat_blocks_blockerId_blockedId"`,
    );
    await queryRunner.query(`DROP TABLE "chat_blocks"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_chat_messages_senderId"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_chat_messages_jobId"`);
    await queryRunner.query(`DROP TABLE "chat_messages"`);
    await queryRunner.query(`DROP TYPE "public"."chat_messages_type_enum"`);
  }
}
