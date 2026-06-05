import { MigrationInterface, QueryRunner } from 'typeorm';

// Moneda en listas de precio y registro de moneda + cotización en la venta (punto 3c).
// No destructiva: agrega columnas con default ARS / cotización 1 para todo lo existente.
// Los importes de las ventas siguen en pesos; currency/exchange_rate son solo referencia.
export class PriceListAndSaleCurrency1717300000000 implements MigrationInterface {
  name = 'PriceListAndSaleCurrency1717300000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "price_list_items" ADD COLUMN IF NOT EXISTS "currency" varchar(3) NOT NULL DEFAULT 'ARS'`,
    );
    await queryRunner.query(
      `ALTER TABLE "sales_orders" ADD COLUMN IF NOT EXISTS "currency" varchar(3) NOT NULL DEFAULT 'ARS'`,
    );
    await queryRunner.query(
      `ALTER TABLE "sales_orders" ADD COLUMN IF NOT EXISTS "exchange_rate" numeric(14,4) NOT NULL DEFAULT 1`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "sales_orders" DROP COLUMN IF EXISTS "exchange_rate"`);
    await queryRunner.query(`ALTER TABLE "sales_orders" DROP COLUMN IF EXISTS "currency"`);
    await queryRunner.query(`ALTER TABLE "price_list_items" DROP COLUMN IF EXISTS "currency"`);
  }
}
