import { MigrationInterface, QueryRunner } from 'typeorm';

// Registros de pesaje periódico de lotes en cámara de maduración.
// Permite trackear la merma real (el queso pierde peso durante semanas/meses).
// El stock en la tabla batches refleja la cantidad inicial; los maturation_records
// son el historial de pesos reales que permite ajustes de inventario.
export class AddMaturationRecords1716300000000 implements MigrationInterface {
  name = 'AddMaturationRecords1716300000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "maturation_records" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "batch_id" uuid NOT NULL,
        "warehouse_id" uuid NULL,
        "checked_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "weight_kg" numeric(14,3) NOT NULL,
        "notes" text NULL,
        "created_by" uuid NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_maturation_records" PRIMARY KEY ("id"),
        CONSTRAINT "FK_maturation_records_batch"
          FOREIGN KEY ("batch_id") REFERENCES "batches"("id"),
        CONSTRAINT "FK_maturation_records_warehouse"
          FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_maturation_records_created_by"
          FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      'CREATE INDEX "IDX_maturation_records_batch" ON "maturation_records" ("batch_id")',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_maturation_records_checked" ON "maturation_records" ("checked_at")',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_maturation_records_checked"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_maturation_records_batch"');
    await queryRunner.query('DROP TABLE IF EXISTS "maturation_records"');
  }
}
