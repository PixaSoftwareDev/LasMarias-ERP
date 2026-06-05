import { MigrationInterface, QueryRunner } from 'typeorm';

// Punto 5: cuentas (caja/banco) con saldo calculado, catálogo de categorías de gasto y
// cheques. No destructiva: crea tablas, agrega account_id a cash_movements (nullable),
// crea la cuenta "Caja" por defecto y asigna a ella todos los movimientos existentes.
export class AccountsCategoriesCheques1717500000000 implements MigrationInterface {
  name = 'AccountsCategoriesCheques1717500000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "accounts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "name" varchar(120) NOT NULL,
        "kind" varchar(16) NOT NULL,
        "opening_balance" numeric(14,2) NOT NULL DEFAULT 0,
        "is_active" boolean NOT NULL DEFAULT true,
        CONSTRAINT "pk_accounts" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "expense_categories" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "name" varchar(40) NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        CONSTRAINT "pk_expense_categories" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "idx_expense_categories_name" ON "expense_categories" ("name")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cheques" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "kind" varchar(16) NOT NULL,
        "number" varchar(40) NOT NULL,
        "amount" numeric(14,2) NOT NULL,
        "due_date" timestamptz,
        "status" varchar(16) NOT NULL DEFAULT 'en_cartera',
        "account_id" uuid,
        "counterparty" varchar(200),
        "notes" text,
        "created_by" uuid,
        CONSTRAINT "pk_cheques" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_cheques_status" ON "cheques" ("status")`);

    // account_id en cash_movements (nullable).
    await queryRunner.query(
      `ALTER TABLE "cash_movements" ADD COLUMN IF NOT EXISTS "account_id" uuid`,
    );

    // Cuenta "Caja" por defecto + backfill de los movimientos existentes.
    await queryRunner.query(`
      INSERT INTO "accounts" ("name", "kind", "opening_balance", "is_active")
      SELECT 'Caja', 'caja', 0, true
      WHERE NOT EXISTS (SELECT 1 FROM "accounts" WHERE "name" = 'Caja')
    `);
    await queryRunner.query(`
      UPDATE "cash_movements"
      SET "account_id" = (SELECT "id" FROM "accounts" WHERE "name" = 'Caja' ORDER BY "created_at" ASC LIMIT 1)
      WHERE "account_id" IS NULL
    `);

    // Categorías de gasto base.
    await queryRunner.query(`
      INSERT INTO "expense_categories" ("name")
      SELECT unnest(ARRAY['Insumos','Servicios','Sueldos','Impuestos','Fletes','Mantenimiento','Otros'])
      ON CONFLICT ("name") DO NOTHING
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "cash_movements" DROP COLUMN IF EXISTS "account_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "cheques"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "expense_categories"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "accounts"`);
  }
}
