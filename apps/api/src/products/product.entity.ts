import { Column, Entity, Index } from 'typeorm';
import type { ProductCategory, ProductUnit } from '@lasmarias/shared-schemas';
import { BaseEntity } from '../database/base.entity';

@Entity({ name: 'products' })
export class ProductEntity extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 50 })
  sku!: string;

  @Index()
  @Column({ type: 'varchar', length: 200 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'varchar', length: 32 })
  category!: ProductCategory;

  @Column({ type: 'varchar', length: 16 })
  unit!: ProductUnit;

  @Column({ type: 'boolean', name: 'track_batches', default: true })
  trackBatches!: boolean;

  // Alícuota de IVA argentina. Lácteos procesados: 10.5%; leche fluida: 0%; dulce de leche: 21%.
  @Column({ type: 'numeric', precision: 6, scale: 2, name: 'iva_rate_percent', default: 10.5 })
  ivaRatePercent!: string;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive!: boolean;
}
