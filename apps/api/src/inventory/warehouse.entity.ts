import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../database/base.entity';

@Entity({ name: 'warehouses' })
export class WarehouseEntity extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 20 })
  code!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'varchar', length: 32 })
  kind!: 'cold_chamber' | 'sector' | 'dry_storage' | 'maturation';

  @Column({ type: 'numeric', precision: 5, scale: 2, name: 'target_temp_celsius', nullable: true })
  targetTemperatureCelsius!: string | null;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive!: boolean;
}
