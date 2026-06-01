import { MigrationInterface, QueryRunner } from 'typeorm';

// Fase 2 — stock mínimo configurable por producto (CLAUDE.md §4.4).
//   - products.min_stock_level: umbral de alerta de stock bajo. Si el stock total
//     del producto cae a este valor o por debajo, se marca alerta 'low'.
// No destructiva: solo agrega una columna nullable.
export class ProductMinStock1716500000000 implements MigrationInterface {
  name = 'ProductMinStock1716500000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "min_stock_level" numeric(14,3)',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "products" DROP COLUMN IF EXISTS "min_stock_level"');
  }
}
