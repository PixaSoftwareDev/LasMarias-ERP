import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../database/base.entity';
import { BatchEntity } from '../batches/batch.entity';

// Registro de pesaje periódico de un lote en cámara de maduración.
// El queso pierde peso durante semanas/meses; estos registros permiten
// ajustar el inventario real sin alterar el stock inicial del lote.
@Entity({ name: 'maturation_records' })
@Index(['batchId'])
@Index(['checkedAt'])
export class MaturationRecordEntity {
  @Column({ type: 'uuid', primary: true, generated: 'uuid' })
  id!: string;

  @Column({ type: 'uuid', name: 'batch_id' })
  batchId!: string;

  @ManyToOne(() => BatchEntity)
  @JoinColumn({ name: 'batch_id' })
  batch!: BatchEntity;

  @Column({ type: 'uuid', name: 'warehouse_id', nullable: true })
  warehouseId!: string | null;

  @Column({ type: 'timestamptz', name: 'checked_at' })
  checkedAt!: Date;

  @Column({ type: 'numeric', precision: 14, scale: 3, name: 'weight_kg' })
  weightKg!: string;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ type: 'uuid', name: 'created_by', nullable: true })
  createdById!: string | null;

  @Column({ type: 'timestamptz', name: 'created_at', default: () => 'now()' })
  createdAt!: Date;
}
