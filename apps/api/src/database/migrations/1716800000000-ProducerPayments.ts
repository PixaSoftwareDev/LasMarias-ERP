import { MigrationInterface, QueryRunner } from 'typeorm';

// Pagos a tambos (cuenta por pagar). El "debe" se deriva de las recepciones de leche
// (litros × precio); esta tabla registra los pagos que bajan ese saldo. No destructiva.
export class ProducerPayments1716800000000 implements MigrationInterface {
  name = 'ProducerPayments1716800000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "producer_payments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "producer_id" uuid NOT NULL,
        "amount" numeric(14,2) NOT NULL,
        "occurred_at" timestamptz NOT NULL,
        "method" varchar(40),
        "notes" text,
        "created_by" uuid,
        CONSTRAINT "PK_producer_payments" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_producer_payments_producer" ON "producer_payments" ("producer_id")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "producer_payments"`);
  }
}
