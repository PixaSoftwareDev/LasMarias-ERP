import { MigrationInterface, QueryRunner } from 'typeorm';

// Guarda el desglose de costo (real + estándar + desvíos) calculado al cerrar la
// orden de producción, para mostrarlo en pantalla sin recalcular. CLAUDE.md §5.
export class ProductionCostBreakdown1716200000000 implements MigrationInterface {
  name = 'ProductionCostBreakdown1716200000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "production_orders" ADD COLUMN IF NOT EXISTS "cost_breakdown" jsonb',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "production_orders" DROP COLUMN IF EXISTS "cost_breakdown"');
  }
}
