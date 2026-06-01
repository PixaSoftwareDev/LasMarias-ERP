import { Column, Entity, Index, ManyToOne, JoinColumn } from 'typeorm';
import type { BatchStatus } from '@lasmarias/shared-schemas';
import { BaseEntity } from '../database/base.entity';
import { ProductEntity } from '../products/product.entity';
import { WarehouseEntity } from '../inventory/warehouse.entity';

// Lote — núcleo de la trazabilidad bidireccional (CLAUDE.md §4.4).
// Aplica a leche cruda recepcionada y a productos terminados.

@Entity({ name: 'batches' })
@Index(['code'], { unique: true })
export class BatchEntity extends BaseEntity {
  @Column({ type: 'varchar', length: 50 })
  code!: string;

  @Column({ type: 'uuid', name: 'product_id', nullable: true })
  productId!: string | null;

  @ManyToOne(() => ProductEntity, { nullable: true })
  @JoinColumn({ name: 'product_id' })
  product!: ProductEntity | null;

  @Column({ type: 'timestamptz', name: 'production_date', nullable: true })
  productionDate!: Date | null;

  @Column({ type: 'timestamptz', name: 'expiration_date', nullable: true })
  expirationDate!: Date | null;

  @Column({ type: 'numeric', precision: 14, scale: 3, name: 'initial_quantity' })
  initialQuantity!: string;

  @Column({ type: 'numeric', precision: 14, scale: 3, name: 'remaining_quantity' })
  remainingQuantity!: string;

  @Column({ type: 'varchar', length: 16 })
  unit!: 'kg' | 'litro' | 'unidad';

  // Costo unitario al que entró/se produjo el lote ($/litro la leche, $/kg la masa/producto).
  // Habilita el costeo encadenado: un lote intermedio (masa) hereda su costo al siguiente paso.
  @Column({ type: 'numeric', precision: 12, scale: 4, name: 'unit_cost', nullable: true })
  unitCost!: string | null;

  @Column({ type: 'varchar', length: 32 })
  status!: BatchStatus;

  @Column({ type: 'uuid', name: 'parent_batch_id', nullable: true })
  parentBatchId!: string | null;

  // Ubicación física del lote: cámara/sector donde está almacenado (CLAUDE.md §4.4).
  @Column({ type: 'uuid', name: 'warehouse_id', nullable: true })
  warehouseId!: string | null;

  @ManyToOne(() => WarehouseEntity, { nullable: true })
  @JoinColumn({ name: 'warehouse_id' })
  warehouse!: WarehouseEntity | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;
}
