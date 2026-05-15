import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import type { SalesOrderLine, SalesOrderStatus } from '@lasmarias/shared-schemas';
import { BaseEntity } from '../database/base.entity';
import { ClientEntity } from '../clients/client.entity';
import { DeliveryZoneEntity } from '../delivery/delivery-zone.entity';
import { UserEntity } from '../users/user.entity';

@Entity({ name: 'sales_orders' })
@Index(['code'], { unique: true })
@Index(['deliveryDate'])
@Index(['status', 'deliveryDate'])
export class SalesOrderEntity extends BaseEntity {
  @Column({ type: 'varchar', length: 50 })
  code!: string;

  @Column({ type: 'uuid', name: 'client_id' })
  clientId!: string;

  @ManyToOne(() => ClientEntity)
  @JoinColumn({ name: 'client_id' })
  client!: ClientEntity;

  @Column({ type: 'uuid', name: 'zone_id', nullable: true })
  zoneId!: string | null;

  @ManyToOne(() => DeliveryZoneEntity, { nullable: true })
  @JoinColumn({ name: 'zone_id' })
  zone!: DeliveryZoneEntity | null;

  @Column({ type: 'varchar', length: 16 })
  status!: SalesOrderStatus;

  @Column({ type: 'timestamptz', name: 'taken_at' })
  takenAt!: Date;

  @Column({ type: 'date', name: 'delivery_date' })
  deliveryDate!: string;

  @Column({ type: 'jsonb', default: [] })
  lines!: SalesOrderLine[];

  @Column({ type: 'numeric', precision: 14, scale: 2, default: '0' })
  total!: string;

  @Column({ type: 'numeric', precision: 6, scale: 3, name: 'discount_percent', default: '0' })
  discountPercent!: string;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ type: 'uuid', name: 'created_by' })
  createdById!: string;

  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: 'created_by' })
  createdBy!: UserEntity;
}
