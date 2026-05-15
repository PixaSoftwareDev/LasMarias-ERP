import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../database/base.entity';
import { ProducerEntity } from '../producers/producer.entity';

@Entity({ name: 'producer_settlements' })
export class ProducerSettlementEntity extends BaseEntity {
  @Column({ type: 'uuid', name: 'producer_id' })
  producerId!: string;

  @ManyToOne(() => ProducerEntity)
  @JoinColumn({ name: 'producer_id' })
  producer!: ProducerEntity;

  @Column({ type: 'date', name: 'period_from' })
  periodFrom!: string;

  @Column({ type: 'date', name: 'period_to' })
  periodTo!: string;

  @Column({ type: 'numeric', precision: 14, scale: 3, name: 'total_liters' })
  totalLiters!: string;

  @Column({ type: 'numeric', precision: 12, scale: 4, name: 'average_price_per_liter' })
  averagePricePerLiter!: string;

  @Column({ type: 'numeric', precision: 14, scale: 2, name: 'total_amount' })
  totalAmount!: string;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;
}
