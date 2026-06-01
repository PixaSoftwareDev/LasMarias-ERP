import { MigrationInterface, QueryRunner } from 'typeorm';

// Fase comercial — Flujo de caja simple (CLAUDE.md §4.7).
//   - cash_movements: ingresos (cobros) y egresos (gastos) con categoría y fecha.
// No destructiva.
export class FinanceCashFlow1716700000000 implements MigrationInterface {
  name = 'FinanceCashFlow1716700000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cash_movements" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "kind" varchar(16) NOT NULL,
        "amount" numeric(14,2) NOT NULL,
        "category" varchar(40) NOT NULL,
        "occurred_at" timestamptz NOT NULL,
        "reference_type" varchar(50),
        "reference_id" uuid,
        "notes" text,
        "created_by" uuid,
        CONSTRAINT "PK_cash_movements" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_cash_movements_occurred" ON "cash_movements" ("occurred_at")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "cash_movements"`);
  }
}
