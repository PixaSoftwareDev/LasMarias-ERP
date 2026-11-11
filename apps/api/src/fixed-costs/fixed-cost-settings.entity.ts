import { Column, Entity, PrimaryColumn } from 'typeorm';

// Ajustes de costos fijos (una sola fila, id = 1). litrosNormales = la leche de un mes normal
// cargada a mano; null = usar el promedio de los últimos 12 meses.
@Entity({ name: 'fixed_cost_settings' })
export class FixedCostSettingsEntity {
  @PrimaryColumn({ type: 'int' })
  id!: number;

  @Column({ type: 'numeric', precision: 14, scale: 1, nullable: true, name: 'litros_normales' })
  litrosNormales!: string | null;

  // Ajuste por inflación (% por mes) que se suma al costo por litro. 0 = sin ajuste.
  @Column({ type: 'numeric', precision: 5, scale: 2, default: 0, name: 'inflacion_mensual' })
  inflacionMensual!: string;
}
