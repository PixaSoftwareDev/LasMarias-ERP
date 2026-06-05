import { MigrationInterface, QueryRunner } from 'typeorm';

// Cotización del día (USD/EUR en pesos), histórico por fecha. No destructiva.
export class ExchangeRates1717100000000 implements MigrationInterface {
  name = 'ExchangeRates1717100000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "exchange_rates" (
        "date" date NOT NULL,
        "usd" numeric(14,4) NOT NULL,
        "eur" numeric(14,4) NOT NULL,
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_exchange_rates" PRIMARY KEY ("date")
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "exchange_rates"`);
  }
}
