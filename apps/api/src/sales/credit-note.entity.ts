import { Column, Entity, Index, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';
import type { SalesOrderLine } from '@lasmarias/shared-schemas';

// Nota de crédito por devolución de un despacho. Repone stock al mismo lote del que
// salió y baja el saldo de cuenta corriente. Precio histórico del despacho.
@Entity({ name: 'credit_notes' })
@Index(['code'], { unique: true })
export class CreditNoteEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 50 })
  code!: string;

  @Column({ type: 'uuid', name: 'sales_order_id' })
  salesOrderId!: string;

  @Column({ type: 'uuid', name: 'client_id' })
  clientId!: string;

  @Column({ type: 'jsonb', default: [] })
  lines!: SalesOrderLine[];

  @Column({ type: 'numeric', precision: 14, scale: 2, default: '0' })
  total!: string;

  @Column({ type: 'uuid', name: 'created_by' })
  createdById!: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
