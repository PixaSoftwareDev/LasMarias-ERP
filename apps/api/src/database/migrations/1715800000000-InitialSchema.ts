import { MigrationInterface, QueryRunner } from 'typeorm';

// Migración inicial — crea las tablas base del sistema (Fase 0)
// y la tabla `milk_receptions` (arranque de Fase 1).

export class InitialSchema1715800000000 implements MigrationInterface {
  name = 'InitialSchema1715800000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Extensión uuid (asegurada por init script de docker, pero por si la migración
    // se aplica en otra DB).
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "email" varchar(254) NOT NULL,
        "password_hash" varchar NOT NULL,
        "full_name" varchar(120) NOT NULL,
        "role" varchar(32) NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        "refresh_token_hash" varchar NULL,
        CONSTRAINT "PK_users" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query('CREATE UNIQUE INDEX "UQ_users_email" ON "users" ("email")');

    await queryRunner.query(`
      CREATE TABLE "clients" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "business_name" varchar(200) NOT NULL,
        "tax_id" varchar(20) NULL,
        "type" varchar(32) NOT NULL,
        "email" varchar(254) NULL,
        "phone" varchar(30) NULL,
        "address" varchar(300) NULL,
        "city" varchar(120) NULL,
        "zone_id" uuid NULL,
        "notes" text NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_clients" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query('CREATE INDEX "IDX_clients_business_name" ON "clients" ("business_name")');
    await queryRunner.query(
      'CREATE UNIQUE INDEX "UQ_clients_tax_id" ON "clients" ("tax_id") WHERE "tax_id" IS NOT NULL',
    );

    await queryRunner.query(`
      CREATE TABLE "products" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "sku" varchar(50) NOT NULL,
        "name" varchar(200) NOT NULL,
        "description" text NULL,
        "category" varchar(32) NOT NULL,
        "unit" varchar(16) NOT NULL,
        "track_batches" boolean NOT NULL DEFAULT true,
        "is_active" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_products" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query('CREATE UNIQUE INDEX "UQ_products_sku" ON "products" ("sku")');
    await queryRunner.query('CREATE INDEX "IDX_products_name" ON "products" ("name")');

    await queryRunner.query(`
      CREATE TABLE "producers" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "name" varchar(200) NOT NULL,
        "tax_id" varchar(20) NULL,
        "phone" varchar(30) NULL,
        "address" varchar(300) NULL,
        "city" varchar(120) NULL,
        "agreed_price_per_liter" numeric(12,4) NULL,
        "notes" text NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_producers" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query('CREATE INDEX "IDX_producers_name" ON "producers" ("name")');
    await queryRunner.query(
      'CREATE UNIQUE INDEX "UQ_producers_tax_id" ON "producers" ("tax_id") WHERE "tax_id" IS NOT NULL',
    );

    await queryRunner.query(`
      CREATE TABLE "batches" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "code" varchar(50) NOT NULL,
        "product_id" uuid NULL,
        "production_date" TIMESTAMP WITH TIME ZONE NULL,
        "expiration_date" TIMESTAMP WITH TIME ZONE NULL,
        "initial_quantity" numeric(14,3) NOT NULL,
        "remaining_quantity" numeric(14,3) NOT NULL,
        "unit" varchar(16) NOT NULL,
        "status" varchar(32) NOT NULL,
        "parent_batch_id" uuid NULL,
        "notes" text NULL,
        CONSTRAINT "PK_batches" PRIMARY KEY ("id"),
        CONSTRAINT "FK_batches_product" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_batches_parent" FOREIGN KEY ("parent_batch_id") REFERENCES "batches"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query('CREATE UNIQUE INDEX "UQ_batches_code" ON "batches" ("code")');

    await queryRunner.query(`
      CREATE TABLE "milk_receptions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "code" varchar(50) NOT NULL,
        "received_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "producer_id" uuid NOT NULL,
        "producer_name" varchar(200) NOT NULL,
        "vehicle_plate" varchar(20) NULL,
        "driver_name" varchar(120) NULL,
        "liters" numeric(14,3) NOT NULL,
        "quality" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "status" varchar(32) NOT NULL,
        "blocked_reason" varchar(500) NULL,
        "notes" text NULL,
        "batch_id" uuid NULL,
        "created_by" uuid NOT NULL,
        CONSTRAINT "PK_milk_receptions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_milk_receptions_producer" FOREIGN KEY ("producer_id") REFERENCES "producers"("id"),
        CONSTRAINT "FK_milk_receptions_batch" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_milk_receptions_user" FOREIGN KEY ("created_by") REFERENCES "users"("id")
      )
    `);
    await queryRunner.query('CREATE UNIQUE INDEX "UQ_milk_receptions_code" ON "milk_receptions" ("code")');
    await queryRunner.query('CREATE INDEX "IDX_milk_receptions_received_at" ON "milk_receptions" ("received_at")');
    await queryRunner.query('CREATE INDEX "IDX_milk_receptions_producer" ON "milk_receptions" ("producer_id")');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "milk_receptions"');
    await queryRunner.query('DROP TABLE IF EXISTS "batches"');
    await queryRunner.query('DROP TABLE IF EXISTS "producers"');
    await queryRunner.query('DROP TABLE IF EXISTS "products"');
    await queryRunner.query('DROP TABLE IF EXISTS "clients"');
    await queryRunner.query('DROP TABLE IF EXISTS "users"');
  }
}
