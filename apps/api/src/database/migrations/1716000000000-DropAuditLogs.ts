import { MigrationInterface, QueryRunner } from 'typeorm';

// Elimina la tabla audit_logs: la entidad de auditoría nunca se llegó a usar
// (no había escritura ni lectura). Se quita para no arrastrar esquema muerto.
// Si más adelante se implementa auditoría real, se recrea con su propia migración.
export class DropAuditLogs1716000000000 implements MigrationInterface {
  name = 'DropAuditLogs1716000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "audit_logs"');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "audit_logs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "entity_type" varchar(50) NOT NULL,
        "entity_id" uuid NOT NULL,
        "action" varchar(32) NOT NULL,
        "actor_id" uuid NOT NULL,
        "diff" jsonb NULL,
        "reason" varchar(500) NULL,
        CONSTRAINT "PK_audit_logs" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query('CREATE INDEX "IDX_audit_logs_entity" ON "audit_logs" ("entity_type", "entity_id")');
    await queryRunner.query('CREATE INDEX "IDX_audit_logs_created" ON "audit_logs" ("created_at")');
  }
}
