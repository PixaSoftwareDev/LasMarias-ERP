import { MigrationInterface, QueryRunner } from 'typeorm';

// Moneda del precio acordado del tambo (ARS/USD/EUR). Default ARS para los existentes.
// Al recibir leche, el precio se convierte a $ con la cotización del día y se congela en el lote.
export class ProducerPriceCurrency1717200000000 implements MigrationInterface {
  name = 'ProducerPriceCurrency1717200000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "producers" ADD COLUMN IF NOT EXISTS "price_currency" varchar(3) NOT NULL DEFAULT 'ARS'`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "producers" DROP COLUMN IF EXISTS "price_currency"`);
  }
}
