import { MigrationInterface, QueryRunner } from 'typeorm';

// Envases retornables (cajones, tarros) que salen con cada entrega y deben volver.
// Tracking por cliente: quantity_out al entregar, quantity_in al devolver.
export class AddReturnableContainers1716200000000 implements MigrationInterface {
  name = 'AddReturnableContainers1716200000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "returnable_containers" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" varchar(120) NOT NULL,
        "code" varchar(30) NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_returnable_containers" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_returnable_containers_code" UNIQUE ("code")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "returnable_container_movements" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "container_id" uuid NOT NULL,
        "client_id" uuid NOT NULL,
        "sales_order_id" uuid NULL,
        "quantity_out" integer NOT NULL DEFAULT 0,
        "quantity_in" integer NOT NULL DEFAULT 0,
        "movement_date" date NOT NULL,
        "notes" text NULL,
        "created_by" uuid NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_returnable_container_movements" PRIMARY KEY ("id"),
        CONSTRAINT "FK_rcm_container"
          FOREIGN KEY ("container_id") REFERENCES "returnable_containers"("id"),
        CONSTRAINT "FK_rcm_client"
          FOREIGN KEY ("client_id") REFERENCES "clients"("id"),
        CONSTRAINT "FK_rcm_sales_order"
          FOREIGN KEY ("sales_order_id") REFERENCES "sales_orders"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_rcm_created_by"
          FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      'CREATE INDEX "IDX_rcm_client" ON "returnable_container_movements" ("client_id")',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_rcm_date" ON "returnable_container_movements" ("movement_date")',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_rcm_container" ON "returnable_container_movements" ("container_id")',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_rcm_container"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_rcm_date"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_rcm_client"');
    await queryRunner.query('DROP TABLE IF EXISTS "returnable_container_movements"');
    await queryRunner.query('DROP TABLE IF EXISTS "returnable_containers"');
  }
}
