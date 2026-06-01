import { MigrationInterface, QueryRunner } from 'typeorm';

// Fase 2 — ubicación física del lote en cámara/sector (CLAUDE.md §4.4).
//   - batches.warehouse_id: cámara/sector donde está físicamente el lote.
//     FK nullable a warehouses con ON DELETE SET NULL (si se borra la cámara,
//     el lote no se borra: queda sin ubicación).
// No destructiva: solo agrega una columna nullable + su constraint.
export class BatchWarehouse1716400000000 implements MigrationInterface {
  name = 'BatchWarehouse1716400000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "batches" ADD COLUMN IF NOT EXISTS "warehouse_id" uuid',
    );
    // La constraint puede existir si la migración corrió a medias; la recreamos de forma idempotente.
    await queryRunner.query(
      'ALTER TABLE "batches" DROP CONSTRAINT IF EXISTS "FK_batches_warehouse"',
    );
    await queryRunner.query(
      'ALTER TABLE "batches" ADD CONSTRAINT "FK_batches_warehouse" ' +
        'FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE SET NULL',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "batches" DROP CONSTRAINT IF EXISTS "FK_batches_warehouse"',
    );
    await queryRunner.query('ALTER TABLE "batches" DROP COLUMN IF EXISTS "warehouse_id"');
  }
}
