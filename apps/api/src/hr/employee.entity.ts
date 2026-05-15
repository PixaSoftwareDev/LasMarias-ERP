import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../database/base.entity';

@Entity({ name: 'employees' })
export class EmployeeEntity extends BaseEntity {
  @Index({ unique: true, where: '"external_id" IS NOT NULL' })
  @Column({ type: 'varchar', length: 50, name: 'external_id', nullable: true })
  externalId!: string | null;

  @Column({ type: 'varchar', length: 80, name: 'first_name' })
  firstName!: string;

  @Column({ type: 'varchar', length: 80, name: 'last_name' })
  lastName!: string;

  @Column({ type: 'varchar', length: 20, name: 'document_number', nullable: true })
  documentNumber!: string | null;

  @Column({ type: 'varchar', length: 60, nullable: true })
  sector!: string | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  shift!: 'morning' | 'afternoon' | 'night' | 'rotating' | null;

  @Column({ type: 'numeric', precision: 12, scale: 2, name: 'hourly_cost', nullable: true })
  hourlyCost!: string | null;

  @Column({ type: 'date', name: 'hired_at', nullable: true })
  hiredAt!: string | null;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive!: boolean;
}
