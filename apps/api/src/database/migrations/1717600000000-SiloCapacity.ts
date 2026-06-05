import { MigrationInterface, QueryRunner } from 'typeorm';

// Silos de leche (CLAUDE.md §9): capacidad en litros para las ubicaciones tipo silo.
// No destructiva: solo agrega la columna (nullable). El tipo 'silo' usa la columna kind
// existente (varchar, sin constraint), así que no requiere cambio de tipo.
export class SiloCapacity1717600000000 implements MigrationInterface {
  name = 'SiloCapacity1717600000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "warehouses" ADD COLUMN IF NOT EXISTS "capacity_liters" numeric(12,2)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "warehouses" DROP COLUMN IF EXISTS "capacity_liters"`);
  }
}
