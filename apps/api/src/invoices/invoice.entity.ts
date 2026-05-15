import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import type { InvoiceStatus } from '@lasmarias/shared-schemas';
import { BaseEntity } from '../database/base.entity';
import { ClientEntity } from '../clients/client.entity';
import { SalesOrderEntity } from '../sales/sales-order.entity';

@Entity({ name: 'invoices' })
@Index(['number'], { unique: true })
@Index(['clientId', 'status'])
export class InvoiceEntity extends BaseEntity {
  @Column({ type: 'varchar', length: 32 })
  number!: string;

  @Column({ type: 'uuid', name: 'client_id' })
  clientId!: string;

  @ManyToOne(() => ClientEntity)
  @JoinColumn({ name: 'client_id' })
  client!: ClientEntity;

  @Column({ type: 'uuid', name: 'sales_order_id', nullable: true })
  salesOrderId!: string | null;

  @ManyToOne(() => SalesOrderEntity, { nullable: true })
  @JoinColumn({ name: 'sales_order_id' })
  salesOrder!: SalesOrderEntity | null;

  @Column({ type: 'timestamptz', name: 'issued_at' })
  issuedAt!: Date;

  @Column({ type: 'date', name: 'due_date', nullable: true })
  dueDate!: string | null;

  @Column({ type: 'varchar', length: 16 })
  status!: InvoiceStatus;

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  subtotal!: string;

  @Column({ type: 'numeric', precision: 14, scale: 2, name: 'tax_amount' })
  taxAmount!: string;

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  total!: string;

  @Column({ type: 'numeric', precision: 14, scale: 2, name: 'paid_amount', default: '0' })
  paidAmount!: string;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;
}
