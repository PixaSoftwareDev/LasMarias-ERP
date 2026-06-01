import { MigrationInterface, QueryRunner } from 'typeorm';

// Fase 1 — soporte de costeo y recepción.
//   - batches.unit_cost: costo unitario del lote ($/litro leche, $/kg masa/producto).
//     Habilita el costeo encadenado leche→masa→mozzarella.
//   - milk_receptions.remito y declared_liters: datos del remito de transporte para
//     calcular la diferencia de litros (recibidos − declarados).
// No destructiva: solo agrega columnas nullable.
export class Phase1Costing1716100000000 implements MigrationInterface {
  name = 'Phase1Costing1716100000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "batches" ADD COLUMN IF NOT EXISTS "unit_cost" numeric(12,4)');
    await queryRunner.query('ALTER TABLE "milk_receptions" ADD COLUMN IF NOT EXISTS "remito" varchar(50)');
    await queryRunner.query(
      'ALTER TABLE "milk_receptions" ADD COLUMN IF NOT EXISTS "declared_liters" numeric(14,3)',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "milk_receptions" DROP COLUMN IF EXISTS "declared_liters"');
    await queryRunner.query('ALTER TABLE "milk_receptions" DROP COLUMN IF EXISTS "remito"');
    await queryRunner.query('ALTER TABLE "batches" DROP COLUMN IF EXISTS "unit_cost"');
  }
}
