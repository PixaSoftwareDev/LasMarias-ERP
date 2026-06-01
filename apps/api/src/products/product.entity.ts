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

  // Stock mínimo configurable — dispara alerta 'low' (CLAUDE.md §4.4). Null = sin umbral.
  @Column({ type: 'numeric', precision: 14, scale: 3, name: 'min_stock_level', nullable: true })
  minStockLevel!: string | null;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive!: boolean;
}
