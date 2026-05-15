import { MigrationInterface, QueryRunner } from 'typeorm';

// Migración para todos los módulos de Fase 1 a 5.
// Asume que la migración anterior (1715800000000-InitialSchema) creó users, clients,
// products, batches, producers, milk_receptions.

export class PhaseModules1715900000000 implements MigrationInterface {
  name = 'PhaseModules1715900000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // --- Recetas + versiones
    await queryRunner.query(`
      CREATE TABLE "recipes" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "product_id" uuid NOT NULL,
        "name" varchar(200) NOT NULL,
        "description" text NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_recipes" PRIMARY KEY ("id"),
        CONSTRAINT "FK_recipes_product" FOREIGN KEY ("product_id") REFERENCES "products"("id")
      )
    `);
    await queryRunner.query('CREATE INDEX "IDX_recipes_product" ON "recipes" ("product_id")');

    await queryRunner.query(`
      CREATE TABLE "recipe_versions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "recipe_id" uuid NOT NULL,
        "version_number" int NOT NULL,
        "base_yield_kg_per_liter" numeric(10,4) NOT NULL,
        "yield_sensitivity_fat" numeric(10,4) NOT NULL DEFAULT 0,
        "yield_sensitivity_protein" numeric(10,4) NOT NULL DEFAULT 0,
        "baseline_fat_percent" numeric(6,3) NOT NULL DEFAULT 3.4,
        "baseline_protein_percent" numeric(6,3) NOT NULL DEFAULT 3.2,
        "standard_waste_percent" numeric(6,3) NOT NULL DEFAULT 0,
        "ingredients" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "byproducts" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "is_active" boolean NOT NULL DEFAULT true,
        "notes" text NULL,
        CONSTRAINT "PK_recipe_versions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_recipe_versions_recipe" FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX "UQ_recipe_versions_recipe_number" ON "recipe_versions" ("recipe_id", "version_number")',
    );

    // --- Producción
    await queryRunner.query(`
      CREATE TABLE "production_orders" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "code" varchar(50) NOT NULL,
        "recipe_id" uuid NOT NULL,
        "recipe_version_id" uuid NOT NULL,
        "status" varchar(16) NOT NULL,
        "started_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "closed_at" TIMESTAMP WITH TIME ZONE NULL,
        "operator_id" uuid NOT NULL,
        "milk_inputs" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "expected_outputs" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "actual_outputs" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "total_milk_liters" numeric(14,3) NOT NULL DEFAULT 0,
        "total_principal_kg" numeric(14,3) NULL,
        "total_cost" numeric(14,2) NULL,
        "unit_cost" numeric(14,4) NULL,
        "notes" text NULL,
        CONSTRAINT "PK_production_orders" PRIMARY KEY ("id"),
        CONSTRAINT "FK_production_orders_recipe" FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id"),
        CONSTRAINT "FK_production_orders_recipe_version" FOREIGN KEY ("recipe_version_id") REFERENCES "recipe_versions"("id"),
        CONSTRAINT "FK_production_orders_operator" FOREIGN KEY ("operator_id") REFERENCES "users"("id")
      )
    `);
    await queryRunner.query('CREATE UNIQUE INDEX "UQ_production_orders_code" ON "production_orders" ("code")');
    await queryRunner.query('CREATE INDEX "IDX_production_orders_status_started" ON "production_orders" ("status", "started_at")');

    // --- Inventario
    await queryRunner.query(`
      CREATE TABLE "warehouses" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "code" varchar(20) NOT NULL,
        "name" varchar(120) NOT NULL,
        "kind" varchar(32) NOT NULL,
        "target_temp_celsius" numeric(5,2) NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_warehouses" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query('CREATE UNIQUE INDEX "UQ_warehouses_code" ON "warehouses" ("code")');

    await queryRunner.query(`
      CREATE TABLE "inventory_movements" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "batch_id" uuid NOT NULL,
        "product_id" uuid NULL,
        "type" varchar(16) NOT NULL,
        "reason" varchar(32) NOT NULL,
        "quantity" numeric(14,3) NOT NULL,
        "unit" varchar(16) NOT NULL,
        "warehouse_id" uuid NULL,
        "reference_type" varchar(50) NULL,
        "reference_id" uuid NULL,
        "notes" text NULL,
        "created_by" uuid NOT NULL,
        CONSTRAINT "PK_inventory_movements" PRIMARY KEY ("id"),
        CONSTRAINT "FK_inv_mov_batch" FOREIGN KEY ("batch_id") REFERENCES "batches"("id"),
        CONSTRAINT "FK_inv_mov_product" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_inv_mov_warehouse" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_inv_mov_user" FOREIGN KEY ("created_by") REFERENCES "users"("id")
      )
    `);
    await queryRunner.query('CREATE INDEX "IDX_inv_mov_batch" ON "inventory_movements" ("batch_id")');
    await queryRunner.query('CREATE INDEX "IDX_inv_mov_product_created" ON "inventory_movements" ("product_id", "created_at")');

    // --- Reparto
    await queryRunner.query(`
      CREATE TABLE "delivery_zones" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "name" varchar(120) NOT NULL,
        "description" varchar(500) NULL,
        "delivery_days" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "cutoff_time" varchar(5) NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_delivery_zones" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query('CREATE UNIQUE INDEX "UQ_delivery_zones_name" ON "delivery_zones" ("name")');

    await queryRunner.query(`
      CREATE TABLE "delivery_exceptions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "zone_id" uuid NOT NULL,
        "date" date NOT NULL,
        "kind" varchar(16) NOT NULL,
        "reason" varchar(200) NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_delivery_exceptions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_delivery_exceptions_zone" FOREIGN KEY ("zone_id") REFERENCES "delivery_zones"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query('CREATE INDEX "IDX_delivery_exceptions_zone_date" ON "delivery_exceptions" ("zone_id", "date")');

    // Linkear clients.zone_id ahora que existe delivery_zones
    await queryRunner.query(`
      ALTER TABLE "clients"
      ADD CONSTRAINT "FK_clients_zone" FOREIGN KEY ("zone_id") REFERENCES "delivery_zones"("id") ON DELETE SET NULL
    `);

    // --- Ventas
    await queryRunner.query(`
      CREATE TABLE "price_lists" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "name" varchar(120) NOT NULL,
        "description" varchar(500) NULL,
        "client_type" varchar(32) NOT NULL,
        "valid_from" TIMESTAMP WITH TIME ZONE NULL,
        "valid_to" TIMESTAMP WITH TIME ZONE NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_price_lists" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query('CREATE INDEX "IDX_price_lists_name" ON "price_lists" ("name")');

    await queryRunner.query(`
      CREATE TABLE "price_list_items" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "price_list_id" uuid NOT NULL,
        "product_id" uuid NOT NULL,
        "unit_price" numeric(14,2) NOT NULL,
        CONSTRAINT "PK_price_list_items" PRIMARY KEY ("id"),
        CONSTRAINT "FK_pli_list" FOREIGN KEY ("price_list_id") REFERENCES "price_lists"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_pli_product" FOREIGN KEY ("product_id") REFERENCES "products"("id")
      )
    `);
    await queryRunner.query('CREATE UNIQUE INDEX "UQ_pli_list_product" ON "price_list_items" ("price_list_id", "product_id")');

    await queryRunner.query(`
      CREATE TABLE "sales_orders" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "code" varchar(50) NOT NULL,
        "client_id" uuid NOT NULL,
        "zone_id" uuid NULL,
        "status" varchar(16) NOT NULL,
        "taken_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "delivery_date" date NOT NULL,
        "lines" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "total" numeric(14,2) NOT NULL DEFAULT 0,
        "discount_percent" numeric(6,3) NOT NULL DEFAULT 0,
        "notes" text NULL,
        "created_by" uuid NOT NULL,
        CONSTRAINT "PK_sales_orders" PRIMARY KEY ("id"),
        CONSTRAINT "FK_sales_orders_client" FOREIGN KEY ("client_id") REFERENCES "clients"("id"),
        CONSTRAINT "FK_sales_orders_zone" FOREIGN KEY ("zone_id") REFERENCES "delivery_zones"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_sales_orders_user" FOREIGN KEY ("created_by") REFERENCES "users"("id")
      )
    `);
    await queryRunner.query('CREATE UNIQUE INDEX "UQ_sales_orders_code" ON "sales_orders" ("code")');
    await queryRunner.query('CREATE INDEX "IDX_sales_orders_delivery_date" ON "sales_orders" ("delivery_date")');
    await queryRunner.query('CREATE INDEX "IDX_sales_orders_status_delivery" ON "sales_orders" ("status", "delivery_date")');

    // --- Comprobantes
    await queryRunner.query(`
      CREATE TABLE "invoices" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "number" varchar(32) NOT NULL,
        "client_id" uuid NOT NULL,
        "sales_order_id" uuid NULL,
        "issued_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "due_date" date NULL,
        "status" varchar(16) NOT NULL,
        "subtotal" numeric(14,2) NOT NULL,
        "tax_amount" numeric(14,2) NOT NULL,
        "total" numeric(14,2) NOT NULL,
        "paid_amount" numeric(14,2) NOT NULL DEFAULT 0,
        "notes" text NULL,
        CONSTRAINT "PK_invoices" PRIMARY KEY ("id"),
        CONSTRAINT "FK_invoices_client" FOREIGN KEY ("client_id") REFERENCES "clients"("id"),
        CONSTRAINT "FK_invoices_order" FOREIGN KEY ("sales_order_id") REFERENCES "sales_orders"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query('CREATE UNIQUE INDEX "UQ_invoices_number" ON "invoices" ("number")');
    await queryRunner.query('CREATE INDEX "IDX_invoices_client_status" ON "invoices" ("client_id", "status")');

    // --- Compras
    await queryRunner.query(`
      CREATE TABLE "suppliers" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "business_name" varchar(200) NOT NULL,
        "tax_id" varchar(20) NULL,
        "contact_name" varchar(120) NULL,
        "email" varchar(254) NULL,
        "phone" varchar(30) NULL,
        "address" varchar(300) NULL,
        "notes" text NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_suppliers" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query('CREATE INDEX "IDX_suppliers_name" ON "suppliers" ("business_name")');
    await queryRunner.query(
      'CREATE UNIQUE INDEX "UQ_suppliers_tax_id" ON "suppliers" ("tax_id") WHERE "tax_id" IS NOT NULL',
    );

    await queryRunner.query(`
      CREATE TABLE "purchase_orders" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "code" varchar(50) NOT NULL,
        "supplier_id" uuid NOT NULL,
        "status" varchar(16) NOT NULL,
        "ordered_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "expected_date" date NULL,
        "lines" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "total" numeric(14,2) NOT NULL DEFAULT 0,
        "notes" text NULL,
        CONSTRAINT "PK_purchase_orders" PRIMARY KEY ("id"),
        CONSTRAINT "FK_purchase_orders_supplier" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id")
      )
    `);
    await queryRunner.query('CREATE UNIQUE INDEX "UQ_purchase_orders_code" ON "purchase_orders" ("code")');
    await queryRunner.query('CREATE INDEX "IDX_purchase_orders_supplier_status" ON "purchase_orders" ("supplier_id", "status")');

    await queryRunner.query(`
      CREATE TABLE "producer_settlements" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "producer_id" uuid NOT NULL,
        "period_from" date NOT NULL,
        "period_to" date NOT NULL,
        "total_liters" numeric(14,3) NOT NULL,
        "average_price_per_liter" numeric(12,4) NOT NULL,
        "total_amount" numeric(14,2) NOT NULL,
        "notes" text NULL,
        CONSTRAINT "PK_producer_settlements" PRIMARY KEY ("id"),
        CONSTRAINT "FK_producer_settlements_producer" FOREIGN KEY ("producer_id") REFERENCES "producers"("id")
      )
    `);

    // --- RRHH
    await queryRunner.query(`
      CREATE TABLE "employees" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "external_id" varchar(50) NULL,
        "first_name" varchar(80) NOT NULL,
        "last_name" varchar(80) NOT NULL,
        "document_number" varchar(20) NULL,
        "sector" varchar(60) NULL,
        "shift" varchar(16) NULL,
        "hourly_cost" numeric(12,2) NULL,
        "hired_at" date NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_employees" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX "UQ_employees_external_id" ON "employees" ("external_id") WHERE "external_id" IS NOT NULL',
    );

    await queryRunner.query(`
      CREATE TABLE "attendance_events" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "employee_id" uuid NOT NULL,
        "type" varchar(4) NOT NULL,
        "timestamp" TIMESTAMP WITH TIME ZONE NOT NULL,
        "source" varchar(16) NOT NULL,
        "device_id" varchar(50) NULL,
        "geo_lat" numeric(9,6) NULL,
        "geo_lng" numeric(9,6) NULL,
        CONSTRAINT "PK_attendance_events" PRIMARY KEY ("id"),
        CONSTRAINT "FK_attendance_events_employee" FOREIGN KEY ("employee_id") REFERENCES "employees"("id")
      )
    `);
    await queryRunner.query('CREATE INDEX "IDX_attendance_events_employee_ts" ON "attendance_events" ("employee_id", "timestamp")');
    await queryRunner.query('CREATE INDEX "IDX_attendance_events_ts" ON "attendance_events" ("timestamp")');

    // --- Notificaciones y auditoría
    await queryRunner.query(`
      CREATE TABLE "notifications" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "title" varchar(200) NOT NULL,
        "body" text NULL,
        "severity" varchar(16) NOT NULL,
        "kind" varchar(32) NOT NULL,
        "reference_type" varchar(50) NULL,
        "reference_id" uuid NULL,
        "read" boolean NOT NULL DEFAULT false,
        CONSTRAINT "PK_notifications" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query('CREATE INDEX "IDX_notifications_read_created" ON "notifications" ("read", "created_at")');

    await queryRunner.query(`
      CREATE TABLE "audit_logs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "entity_type" varchar(50) NOT NULL,
        "entity_id" uuid NOT NULL,
        "action" varchar(32) NOT NULL,
        "actor_id" uuid NOT NULL,
        "diff" jsonb NULL,
        "reason" varchar(500) NULL,
        CONSTRAINT "PK_audit_logs" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query('CREATE INDEX "IDX_audit_logs_entity" ON "audit_logs" ("entity_type", "entity_id")');
    await queryRunner.query('CREATE INDEX "IDX_audit_logs_created" ON "audit_logs" ("created_at")');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "clients" DROP CONSTRAINT IF EXISTS "FK_clients_zone"');
    const tables = [
      'audit_logs',
      'notifications',
      'attendance_events',
      'employees',
      'producer_settlements',
      'purchase_orders',
      'suppliers',
      'invoices',
      'sales_orders',
      'price_list_items',
      'price_lists',
      'delivery_exceptions',
      'delivery_zones',
      'inventory_movements',
      'warehouses',
      'production_orders',
      'recipe_versions',
      'recipes',
    ];
    for (const t of tables) {
      await queryRunner.query(`DROP TABLE IF EXISTS "${t}"`);
    }
  }
}
