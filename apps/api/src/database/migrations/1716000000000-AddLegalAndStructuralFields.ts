import { MigrationInterface, QueryRunner } from 'typeorm';

// Agrega campos legales/regulatorios y corrige la trazabilidad inversa de lotes.
// RENSPA en productores (obligatorio SENASA).
// analysis_status + lab_results_expected_date + tank_number en recepciones (soporte lab externo).
// iva_rate_percent en productos (alícuotas diferenciadas lácteos argentinos).
// production_order_id en batches (resuelve trazabilidad producto → orden → leche).
export class AddLegalAndStructuralFields1716000000000 implements MigrationInterface {
  name = 'AddLegalAndStructuralFields1716000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // --- Productores: RENSPA (Registro Nacional Sanitario de Productores Agropecuarios)
    await queryRunner.query(`
      ALTER TABLE "producers"
        ADD COLUMN IF NOT EXISTS "renspa" varchar(20) NULL
    `);

    // --- Recepciones de leche: campos para análisis externo con resultado demorado
    await queryRunner.query(`
      ALTER TABLE "milk_receptions"
        ADD COLUMN IF NOT EXISTS "analysis_status" varchar(16) NOT NULL DEFAULT 'complete',
        ADD COLUMN IF NOT EXISTS "lab_results_expected_date" date NULL,
        ADD COLUMN IF NOT EXISTS "tank_number" varchar(30) NULL
    `);

    // --- Productos: alícuota de IVA (default 10.5 — quesos y la mayoría de lácteos procesados)
    await queryRunner.query(`
      ALTER TABLE "products"
        ADD COLUMN IF NOT EXISTS "iva_rate_percent" numeric(6,2) NOT NULL DEFAULT 10.5
    `);

    // --- Batches: FK a la orden de producción que lo generó (trazabilidad inversa)
    // Permite ir de un lote de producto terminado → orden → lotes de leche origen
    // sin necesidad de scanear el JSONB milk_inputs.
    await queryRunner.query(`
      ALTER TABLE "batches"
        ADD COLUMN IF NOT EXISTS "production_order_id" uuid NULL,
        ADD CONSTRAINT "FK_batches_production_order"
          FOREIGN KEY ("production_order_id")
          REFERENCES "production_orders"("id")
          ON DELETE SET NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_batches_production_order"
        ON "batches" ("production_order_id")
        WHERE "production_order_id" IS NOT NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_batches_production_order"');
    await queryRunner.query('ALTER TABLE "batches" DROP CONSTRAINT IF EXISTS "FK_batches_production_order"');
    await queryRunner.query('ALTER TABLE "batches" DROP COLUMN IF EXISTS "production_order_id"');
    await queryRunner.query('ALTER TABLE "products" DROP COLUMN IF EXISTS "iva_rate_percent"');
    await queryRunner.query('ALTER TABLE "milk_receptions" DROP COLUMN IF EXISTS "tank_number"');
    await queryRunner.query('ALTER TABLE "milk_receptions" DROP COLUMN IF EXISTS "lab_results_expected_date"');
    await queryRunner.query('ALTER TABLE "milk_receptions" DROP COLUMN IF EXISTS "analysis_status"');
    await queryRunner.query('ALTER TABLE "producers" DROP COLUMN IF EXISTS "renspa"');
  }
}
