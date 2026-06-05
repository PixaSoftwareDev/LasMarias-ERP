import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import type { SalesOrderLine } from '@lasmarias/shared-schemas';
import { BaseEntity } from '../database/base.entity';
import { ClientEntity } from '../clients/client.entity';
import { UserEntity } from '../users/user.entity';

// Despacho de mercadería (Fase 1): cliente + líneas con precio a mano. Baja stock al crear.
@Entity({ name: 'sales_orders' })
@Index(['code'], { unique: true })
export class SalesOrderEntity extends BaseEntity {
  @Column({ type: 'varchar', length: 50 })
  code!: string;

  @Column({ type: 'uuid', name: 'client_id' })
  clientId!: string;

  @ManyToOne(() => ClientEntity)
  @JoinColumn({ name: 'client_id' })
  client!: ClientEntity;

  // Momento del despacho. Reusa la columna histórica taken_at.
  @Column({ type: 'timestamptz', name: 'taken_at' })
  dispatchedAt!: Date;

  @Column({ type: 'jsonb', default: [] })
  lines!: SalesOrderLine[];

  @Column({ type: 'numeric', precision: 14, scale: 2, default: '0' })
  total!: string;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  // Tipo de comprobante. Por ahora siempre 'remito' (interno, NO fiscal).
  @Column({ type: 'varchar', length: 16, name: 'document_type', default: 'remito' })
  documentType!: string;

  // Forma de pago elegida al despachar (contado / cuenta_corriente). Solo informativo;
  // la lógica de cuenta corriente no depende de esto. Nullable: ventas viejas sin dato.
  @Column({ type: 'varchar', length: 20, name: 'payment_mode', nullable: true })
  paymentMode!: string | null;

  @Column({ type: 'uuid', name: 'created_by' })
  createdById!: string;

  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: 'created_by' })
  createdBy!: UserEntity;
}
