import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../database/base.entity';

// Productor de leche cruda. Es el "proveedor" en el contexto de Recepción de leche
// (CLAUDE.md §4.5 — productores son un tipo especial de proveedor).
// Modelado como entidad propia para simplificar el módulo inicial.

@Entity({ name: 'producers' })
export class ProducerEntity extends BaseEntity {
  @Index()
  @Column({ type: 'varchar', length: 200 })
  name!: string;

  @Index({ unique: true, where: '"tax_id" IS NOT NULL' })
  @Column({ type: 'varchar', length: 20, name: 'tax_id', nullable: true })
  taxId!: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  phone!: string | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  address!: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  city!: string | null;

  // Precio acordado de referencia, $/litro. La liquidación final puede ajustarse por calidad.
  @Column({ type: 'numeric', precision: 12, scale: 4, name: 'agreed_price_per_liter', nullable: true })
  agreedPricePerLiter!: string | null;

  // RENSPA — Registro Nacional Sanitario de Productores Agropecuarios (SENASA obligatorio).
  @Column({ type: 'varchar', length: 20, nullable: true })
  renspa!: string | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive!: boolean;
}
