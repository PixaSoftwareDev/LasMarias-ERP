import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

// Precio de la leche de un tambo para un mes (AAAA-MM), en la moneda y con el IVA del tambo.
// Si un mes no tiene precio propio, la recepción usa el precio acordado del tambo.
@Entity({ name: 'producer_month_prices' })
export class ProducerMonthPriceEntity {
  @PrimaryColumn({ type: 'uuid', name: 'producer_id' })
  producerId!: string;

  @PrimaryColumn({ type: 'varchar', length: 7 })
  month!: string;

  @Column({ type: 'numeric', precision: 12, scale: 4 })
  price!: string;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
