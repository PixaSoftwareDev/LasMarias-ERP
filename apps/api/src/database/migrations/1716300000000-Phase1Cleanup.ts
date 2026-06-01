import { MigrationInterface, QueryRunner } from 'typeorm';

// Limpieza: el proyecto se acota a la Fase 1. Se eliminan las tablas de los módulos
// que quedaron fuera de alcance (calendario de reparto, comprobantes, compras/
// proveedores, RRHH, notificaciones, listas de precios) y se simplifica sales_orders
// al "despacho directo" (sin zona, estado, fecha de reparto ni descuento).
// Migración de un solo sentido: el down lanza error a propósito (no se recrea lo borrado).
export class Phase1Cleanup1716300000000 implements MigrationInterface {
  name = 'Phase1Cleanup1716300000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Simplificar sales_orders (dropear columnas también dropea sus FKs/índices).
    await queryRunner.query('ALTER TABLE "sales_orders" DROP COLUMN IF EXISTS "zone_id"');
    await queryRunner.query('ALTER TABLE "sales_orders" DROP COLUMN IF EXISTS "status"');
    await queryRunner.query('ALTER TABLE "sales_orders" DROP COLUMN IF EXISTS "delivery_date"');
    await queryRunner.query('ALTER TABLE "sales_orders" DROP COLUMN IF EXISTS "discount_percent"');

    // Tablas de módulos fuera de alcance.
    for (const table of [
      'price_list_items',
      'price_lists',
      'delivery_exceptions',
      'delivery_zones',
      'invoices',
      'purchase_orders',
      'producer_settlements',
      'suppliers',
      'attendance_events',
      'employees',
      'notifications',
    ]) {
      await queryRunner.query(`DROP TABLE IF EXISTS "${table}" CASCADE`);
    }
  }

  async down(): Promise<void> {
    throw new Error(
      'Phase1Cleanup es una migración de limpieza de un solo sentido. ' +
        'Para recuperar los módulos eliminados, restaurá el código desde git y volvé a generar sus migraciones.',
    );
  }
}
