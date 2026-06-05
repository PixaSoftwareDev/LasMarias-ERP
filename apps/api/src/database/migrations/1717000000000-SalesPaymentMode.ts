import { MigrationInterface, QueryRunner } from 'typeorm';

// Guarda la forma de pago elegida en cada venta (contado / cuenta_corriente) para
// poder verla en ventas pasadas. NO cambia la lógica de cuenta corriente.
// Aditiva: columna nullable; las ventas viejas quedan sin dato (se muestran como '—').
export class SalesPaymentMode1717000000000 implements MigrationInterface {
  name = 'SalesPaymentMode1717000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "sales_orders" ADD COLUMN IF NOT EXISTS "payment_mode" varchar(20)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "sales_orders" DROP COLUMN IF EXISTS "payment_mode"`);
  }
}
