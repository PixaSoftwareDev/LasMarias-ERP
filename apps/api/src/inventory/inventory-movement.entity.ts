import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import type { MovementReason, MovementType } from '@lasmarias/shared-schemas';
import { BatchEntity } from '../batches/batch.entity';
import { ProductEntity } from '../products/product.entity';
import { WarehouseEntity } from './warehouse.entity';
import { UserEntity } from '../users/user.entity';

// Solo create_at (movimientos son inmutables — no se editan, se compensan).
@Entity({ name: 'inventory_movements' })
@Index(['batchId'])
@Index(['productId', 'createdAt'])
export class InventoryMovementEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'batch_id' })
  batchId!: string;

  @ManyToOne(() => BatchEntity)
  @JoinColumn({ name: 'batch_id' })
  batch!: BatchEntity;

  @Column({ type: 'uuid', name: 'product_id', nullable: true })
  productId!: string | null;

  @ManyToOne(() => ProductEntity, { nullable: true })
  @JoinColumn({ name: 'product_id' })
  product!: ProductEntity | null;

  @Column({ type: 'varchar', length: 16 })
  type!: MovementType;

  @Column({ type: 'varchar', length: 32 })
  reason!: MovementReason;

  @Column({ type: 'numeric', precision: 14, scale: 3 })
  quantity!: string;

  @Column({ type: 'varchar', length: 16 })
  unit!: string;

  @Column({ type: 'uuid', name: 'warehouse_id', nullable: true })
  warehouseId!: string | null;

  @ManyToOne(() => WarehouseEntity, { nullable: true })
  @JoinColumn({ name: 'warehouse_id' })
  warehouse!: WarehouseEntity | null;

  @Column({ type: 'varchar', length: 50, name: 'reference_type', nullable: true })
  referenceType!: string | null;

  @Column({ type: 'uuid', name: 'reference_id', nullable: true })
  referenceId!: string | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ type: 'uuid', name: 'created_by' })
  createdById!: string;

  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: 'created_by' })
  createdBy!: UserEntity;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
