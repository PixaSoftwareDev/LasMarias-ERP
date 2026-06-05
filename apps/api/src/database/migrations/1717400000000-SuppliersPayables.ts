import { MigrationInterface, QueryRunner } from 'typeorm';

// Proveedores de insumos + cuentas por pagar (punto 4). No destructiva: solo crea
// tablas nuevas. No toca tambos (producers) ni su liquidación (candado del dueño).
export class SuppliersPayables1717400000000 implements MigrationInterface {
  name = 'SuppliersPayables1717400000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "suppliers" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "name" varchar(200) NOT NULL,
        "tax_id" varchar(20),
        "phone" varchar(40),
        "city" varchar(120),
        "payment_term_days" int,
        "is_active" boolean NOT NULL DEFAULT true,
        CONSTRAINT "pk_suppliers" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_suppliers_name" ON "suppliers" ("name")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "payables" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "supplier_id" uuid NOT NULL,
        "description" varchar(300) NOT NULL,
        "amount" numeric(14,2) NOT NULL,
        "occurred_at" timestamptz NOT NULL,
        "due_date" timestamptz,
        "reference_type" varchar(50),
        "reference_id" uuid,
        "created_by" uuid,
        CONSTRAINT "pk_payables" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_payables_supplier" ON "payables" ("supplier_id")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "supplier_payments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "payable_id" uuid NOT NULL,
        "supplier_id" uuid NOT NULL,
        "amount" numeric(14,2) NOT NULL,
        "occurred_at" timestamptz NOT NULL,
        "method" varchar(40),
        "notes" text,
        "created_by" uuid,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_supplier_payments" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_supplier_payments_payable" ON "supplier_payments" ("payable_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_supplier_payments_supplier" ON "supplier_payments" ("supplier_id")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "supplier_payments"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "payables"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "suppliers"`);
  }
}
