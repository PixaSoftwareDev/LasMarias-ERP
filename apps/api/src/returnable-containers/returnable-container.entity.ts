import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../database/base.entity';

@Entity({ name: 'returnable_containers' })
export class ReturnableContainerEntity extends BaseEntity {
  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 30 })
  code!: string;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive!: boolean;
}
