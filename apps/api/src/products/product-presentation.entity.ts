import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../database/base.entity';
import { ProductEntity } from './product.entity';

@Entity({ name: 'product_presentations' })
export class ProductPresentationEntity extends BaseEntity {
  @Index()
  @Column({ type: 'uuid', name: 'product_id' })
  productId!: string;

  @ManyToOne(() => ProductEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product!: ProductEntity;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 50 })
  sku!: string;

  @Column({ type: 'numeric', precision: 10, scale: 2, name: 'net_weight_g', nullable: true })
  netWeightG!: string | null;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive!: boolean;
}
