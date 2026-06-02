import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

// Configuración de la app como clave→valor (JSON). Hoy hay dos claves: 'company' y
// 'quality_limits'. Tabla chica, sin migraciones por cada parámetro nuevo.
@Entity({ name: 'app_settings' })
export class AppSettingEntity {
  @PrimaryColumn({ type: 'varchar', length: 60 })
  key!: string;

  @Column({ type: 'jsonb' })
  value!: unknown;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
