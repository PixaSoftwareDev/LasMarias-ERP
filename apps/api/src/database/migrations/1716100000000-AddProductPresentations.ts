import { MigrationInterface, QueryRunner } from 'typeorm';

// Presentaciones de envase por producto (400g, 1kg, 4kg del mismo queso).
// El mismo lote de producción puede fraccionarse en distintas presentaciones con SKU y precio propios.
export class AddProductPresentations1716100000000 implements MigrationInterface {
  name = 'AddProductPresentations1716100000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "product_presentations" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "product_id" uuid NOT NULL,
        "name" varchar(120) NOT NULL,
        "sku" varchar(50) NOT NULL,
        "net_weight_g" numeric(10,2) NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_product_presentations" PRIMARY KEY ("id"),
        CONSTRAINT "FK_product_presentations_product"
          FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE,
        CONSTRAINT "UQ_product_presentations_sku" UNIQUE ("sku")
      )
    `);
    await queryRunner.query(
      'CREATE INDEX "IDX_product_presentations_product" ON "product_presentations" ("product_id")',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_product_presentations_product"');
    await queryRunner.query('DROP TABLE IF EXISTS "product_presentations"');
  }
}
