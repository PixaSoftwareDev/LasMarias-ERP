import { MigrationInterface, QueryRunner } from 'typeorm';

// Configuración editable (clave→valor JSON): datos de la empresa para el remito y
// límites de calidad de leche. No destructiva.
export class AppSettings1716900000000 implements MigrationInterface {
  name = 'AppSettings1716900000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "app_settings" (
        "key" varchar(60) NOT NULL,
        "value" jsonb NOT NULL,
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_app_settings" PRIMARY KEY ("key")
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "app_settings"`);
  }
}
