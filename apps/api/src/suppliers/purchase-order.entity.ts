import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import type { PurchaseOrderLine, PurchaseOrderStatus } from '@lasmarias/shared-schemas';
import { BaseEntity } from '../database/base.entity';
import { SupplierEntity } from './supplier.entity';

@Entity({ name: 'purchase_orders' })
@Index(['code'], { unique: true })
@Index(['supplierId', 'status'])
export class PurchaseOrderEntity extends BaseEntity {
  @Column({ type: 'varchar', length: 50 })
  code!: string;

  @Column({ type: 'uuid', name: 'supplier_id' })
  supplierId!: string;

  @ManyToOne(() => SupplierEntity)
  @JoinColumn({ name: 'supplier_id' })
  supplier!: SupplierEntity;

  @Column({ type: 'varchar', length: 16 })
  status!: PurchaseOrderStatus;

  @Column({ type: 'timestamptz', name: 'ordered_at' })
  orderedAt!: Date;

  @Column({ type: 'date', name: 'expected_date', nullable: true })
  expectedDate!: string | null;

  @Column({ type: 'jsonb', default: [] })
  lines!: PurchaseOrderLine[];

  @Column({ type: 'numeric', precision: 14, scale: 2, default: '0' })
  total!: string;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;
}
