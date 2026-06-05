import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

// Cotización del día (carga manual). Una fila por fecha; usd/eur = pesos por 1 unidad.
@Entity({ name: 'exchange_rates' })
export class ExchangeRateEntity {
  @PrimaryColumn({ type: 'date' })
  date!: string; // YYYY-MM-DD

  @Column({ type: 'numeric', precision: 14, scale: 4 })
  usd!: string;

  @Column({ type: 'numeric', precision: 14, scale: 4 })
  eur!: string;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
