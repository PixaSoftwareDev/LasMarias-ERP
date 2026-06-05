import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../database/base.entity';
import { SupplierEntity } from './supplier.entity';

// Comprobante a pagar de un proveedor de insumos. El estado (pendiente/parcial/pagada)
// se DERIVA de los pagos vs el monto; no se persiste para evitar desincronización.
@Entity({ name: 'payables' })
@Index(['supplierId'])
export class PayableEntity extends BaseEntity {
  @Column({ type: 'uuid', name: 'supplier_id' })
  supplierId!: string;

  @ManyToOne(() => SupplierEntity)
  @JoinColumn({ name: 'supplier_id' })
  supplier!: SupplierEntity;

  @Column({ type: 'varchar', length: 300 })
  description!: string;

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  amount!: string;

  @Column({ type: 'timestamptz', name: 'occurred_at' })
  occurredAt!: Date;

  @Column({ type: 'timestamptz', name: 'due_date', nullable: true })
  dueDate!: Date | null;

  // Origen del comprobante (stock_entry, milk_reception, manual).
  @Column({ type: 'varchar', length: 50, name: 'reference_type', nullable: true })
  referenceType!: string | null;

  @Column({ type: 'uuid', name: 'reference_id', nullable: true })
  referenceId!: string | null;

  @Column({ type: 'uuid', name: 'created_by', nullable: true })
  createdById!: string | null;
}
