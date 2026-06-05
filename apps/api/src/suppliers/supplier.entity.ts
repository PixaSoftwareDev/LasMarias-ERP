import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../database/base.entity';

// Proveedor de insumos (fermento, sal, envases, servicios). SEPARADO de los tambos
// (producers): los tambos tienen su propia liquidación derivada de las recepciones.
@Entity({ name: 'suppliers' })
export class SupplierEntity extends BaseEntity {
  @Index()
  @Column({ type: 'varchar', length: 200 })
  name!: string;

  @Column({ type: 'varchar', length: 20, name: 'tax_id', nullable: true })
  taxId!: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  phone!: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  city!: string | null;

  // Plazo de pago en días para el vencimiento de cada comprobante. Null = contado.
  @Column({ type: 'int', name: 'payment_term_days', nullable: true })
  paymentTermDays!: number | null;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive!: boolean;
}
