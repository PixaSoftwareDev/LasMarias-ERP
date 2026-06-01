import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import type { MilkQualityAnalysis, MilkReceptionStatus } from '@lasmarias/shared-schemas';
import { BaseEntity } from '../database/base.entity';
import { ProducerEntity } from '../producers/producer.entity';
import { BatchEntity } from '../batches/batch.entity';
import { UserEntity } from '../users/user.entity';

@Entity({ name: 'milk_receptions' })
@Index(['code'], { unique: true })
@Index(['receivedAt'])
export class MilkReceptionEntity extends BaseEntity {
  @Column({ type: 'varchar', length: 50 })
  code!: string;

  @Column({ type: 'timestamptz', name: 'received_at' })
  receivedAt!: Date;

  @Column({ type: 'uuid', name: 'producer_id' })
  producerId!: string;

  @ManyToOne(() => ProducerEntity)
  @JoinColumn({ name: 'producer_id' })
  producer!: ProducerEntity;

  // Denormalizado para reportes y para preservar el nombre histórico si el productor cambia.
  @Column({ type: 'varchar', length: 200, name: 'producer_name' })
  producerName!: string;

  @Column({ type: 'varchar', length: 20, name: 'vehicle_plate', nullable: true })
  vehiclePlate!: string | null;

  @Column({ type: 'varchar', length: 120, name: 'driver_name', nullable: true })
  driverName!: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  remito!: string | null;

  // Litros declarados en el remito; la diferencia con `liters` (recibidos) se calcula al vuelo.
  @Column({ type: 'numeric', precision: 14, scale: 3, name: 'declared_liters', nullable: true })
  declaredLiters!: string | null;

  @Column({ type: 'numeric', precision: 14, scale: 3 })
  liters!: string;

  // Análisis de calidad — JSONB. CLAUDE.md menciona uso de JSONB para campos flexibles.
  // Estructura validada por shared-schemas.milkQualityAnalysisSchema.
  @Column({ type: 'jsonb', default: {} })
  quality!: MilkQualityAnalysis;

  @Column({ type: 'varchar', length: 32 })
  status!: MilkReceptionStatus;

  @Column({ type: 'varchar', length: 500, name: 'blocked_reason', nullable: true })
  blockedReason!: string | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ type: 'uuid', name: 'batch_id', nullable: true })
  batchId!: string | null;

  @ManyToOne(() => BatchEntity, { nullable: true })
  @JoinColumn({ name: 'batch_id' })
  batch!: BatchEntity | null;

  @Column({ type: 'uuid', name: 'created_by' })
  createdById!: string;

  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: 'created_by' })
  createdBy!: UserEntity;
}
