import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import type { FixedCostLine } from '@lasmarias/shared-schemas';

// Costos fijos de un mes (luz, gas, sueldos con cargas, amortizaciones…). Una fila por mes.
@Entity({ name: 'fixed_cost_months' })
export class FixedCostMonthEntity {
  @PrimaryColumn({ type: 'varchar', length: 7 })
  month!: string; // AAAA-MM

  @Column({ type: 'jsonb', default: [] })
  lines!: FixedCostLine[];

  // Leche de un mes normal por la que se dividen los gastos de ESTE mes. Se guarda la primera vez
  // que se carga el mes, así su $/litro no cambia cuando pasan los meses (el promedio se mueve).
  // null = mes cargado antes de este campo: se usa el promedio de los 12 meses anteriores a él.
  @Column({ type: 'numeric', precision: 14, scale: 1, nullable: true, name: 'litros_base' })
  litrosBase!: string | null;

  // true = el administrativo terminó de cargar el mes (están todas las facturas): recién ahí
  // su $/litro se suma a las elaboraciones. Mientras tanto se sigue usando el último mes listo.
  @Column({ type: 'boolean', default: false })
  listo!: boolean;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
