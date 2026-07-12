import { MigrationInterface, QueryRunner } from "typeorm";

export class AddWorkerDocuments1783403677957 implements MigrationInterface {
    name = 'AddWorkerDocuments1783403677957'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."worker_documents_type_enum" AS ENUM('nic_front', 'nic_back', 'police_letter', 'proof_of_address')`);
        await queryRunner.query(`CREATE TYPE "public"."worker_documents_status_enum" AS ENUM('pending', 'approved', 'rejected')`);
        await queryRunner.query(`CREATE TABLE "worker_documents" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "workerId" uuid NOT NULL, "type" "public"."worker_documents_type_enum" NOT NULL, "storageKey" character varying NOT NULL, "mimeType" character varying NOT NULL, "fileSize" integer NOT NULL, "status" "public"."worker_documents_status_enum" NOT NULL DEFAULT 'pending', "issuedAt" date, "reviewedBy" uuid, "reviewedAt" TIMESTAMP WITH TIME ZONE, "rejectionReason" text, "worker_id" uuid, CONSTRAINT "PK_2c8d6d129a9cb3fe407031ec869" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_f2cd1d5c32a9d062aee017a897" ON "worker_documents"  ("workerId", "type") `);
        await queryRunner.query(`ALTER TABLE "worker_documents" ADD CONSTRAINT "FK_dc9f1218119f810c9bb74c80e63" FOREIGN KEY ("worker_id") REFERENCES "workers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "worker_documents" DROP CONSTRAINT "FK_dc9f1218119f810c9bb74c80e63"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_f2cd1d5c32a9d062aee017a897"`);
        await queryRunner.query(`DROP TABLE "worker_documents"`);
        await queryRunner.query(`DROP TYPE "public"."worker_documents_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."worker_documents_type_enum"`);
    }

}
