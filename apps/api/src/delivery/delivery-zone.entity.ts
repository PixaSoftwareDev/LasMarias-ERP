import { Column, Entity, Index } from 'typeorm';
import type { Weekday } from '@lasmarias/shared-schemas';
import { BaseEntity } from '../database/base.entity';

@Entity({ name: 'delivery_zones' })
export class DeliveryZoneEntity extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description!: string | null;

  // Lista de días de reparto (mon, tue, ...) como JSONB array.
  @Column({ type: 'jsonb', name: 'delivery_days', default: [] })
  deliveryDays!: Weekday[];

  @Column({ type: 'varchar', length: 5, name: 'cutoff_time' })
  cutoffTime!: string;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive!: boolean;
}

@Entity({ name: 'delivery_exceptions' })
@Index(['zoneId', 'date'])
export class DeliveryExceptionEntity {
  @Column({ type: 'uuid', name: 'id', primary: true, default: () => 'uuid_generate_v4()' })
  id!: string;

  @Column({ type: 'uuid', name: 'zone_id' })
  zoneId!: string;

  @Column({ type: 'date' })
  date!: string;

  @Column({ type: 'varchar', length: 16 })
  kind!: 'suspended' | 'extra';

  @Column({ type: 'varchar', length: 200, nullable: true })
  reason!: string | null;

  @Column({ type: 'timestamptz', name: 'created_at', default: () => 'now()' })
  createdAt!: Date;
}
