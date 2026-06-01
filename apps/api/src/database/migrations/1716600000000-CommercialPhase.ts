import { MigrationInterface, QueryRunner } from 'typeorm';

// Fase comercial — Ventas + Cuenta corriente + Notas de crédito (CLAUDE.md §4.6).
//   - price_list_items: precio por (tipo de cliente, producto). Vigente = is_active.
//   - account_movements: cuenta corriente por despacho (charge/payment/credit_note).
//   - credit_notes: devoluciones con reposición de stock.
//   - clients.payment_term_days: condición de pago default (null = contado).
//   - sales_orders.document_type: tipo de comprobante (remito interno).
// No destructiva: CREATE TABLE / ADD COLUMN idempotentes.
export class CommercialPhase1716600000000 implements MigrationInterface {
  name = 'CommercialPhase1716600000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "price_list_items" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "client_type" varchar(32) NOT NULL,
        "product_id" uuid NOT NULL,
        "unit_price" numeric(14,2) NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_price_list_items" PRIMARY KEY ("id"),
        CONSTRAINT "FK_price_list_items_product"
          FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE
      )
    `);
    // Un solo precio vigente por (tipo de cliente, producto).
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_price_list_active"
        ON "price_list_items" ("client_type", "product_id") WHERE "is_active"
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "account_movements" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "client_id" uuid NOT NULL,
        "kind" varchar(16) NOT NULL,
        "amount" numeric(14,2) NOT NULL,
        "reference_type" varchar(50),
        "reference_id" uuid,
        "occurred_at" timestamptz NOT NULL,
        "due_date" timestamptz,
        "notes" text,
        "created_by" uuid,
        CONSTRAINT "PK_account_movements" PRIMARY KEY ("id"),
        CONSTRAINT "FK_account_movements_client"
          FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_account_movements_client" ON "account_movements" ("client_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "credit_notes" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "code" varchar(50) NOT NULL,
        "sales_order_id" uuid NOT NULL,
        "client_id" uuid NOT NULL,
        "lines" jsonb NOT NULL DEFAULT '[]',
        "total" numeric(14,2) NOT NULL DEFAULT '0',
        "created_by" uuid NOT NULL,
        CONSTRAINT "PK_credit_notes" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_credit_notes_code" ON "credit_notes" ("code")`,
    );

    await queryRunner.query(
      `ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "payment_term_days" int`,
    );
    await queryRunner.query(
      `ALTER TABLE "sales_orders" ADD COLUMN IF NOT EXISTS "document_type" varchar(16) NOT NULL DEFAULT 'remito'`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "sales_orders" DROP COLUMN IF EXISTS "document_type"`);
    await queryRunner.query(`ALTER TABLE "clients" DROP COLUMN IF EXISTS "payment_term_days"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "credit_notes"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "account_movements"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "price_list_items"`);
  }
}
