import { Column, Entity, Index } from 'typeorm';
import type { ClientType } from '@lasmarias/shared-schemas';
import { BaseEntity } from '../database/base.entity';

@Entity({ name: 'clients' })
export class ClientEntity extends BaseEntity {
  @Index()
  @Column({ type: 'varchar', length: 200, name: 'business_name' })
  businessName!: string;

  @Index({ unique: true, where: '"tax_id" IS NOT NULL' })
  @Column({ type: 'varchar', length: 20, name: 'tax_id', nullable: true })
  taxId!: string | null;

  @Column({ type: 'varchar', length: 32 })
  type!: ClientType;

  @Column({ type: 'varchar', length: 254, nullable: true })
  email!: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  phone!: string | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  address!: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  city!: string | null;

  // Condición de pago default: null = contado; N = a N días.
  @Column({ type: 'int', name: 'payment_term_days', nullable: true })
  paymentTermDays!: number | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive!: boolean;
}
