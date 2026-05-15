import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseEntity } from '../database/base.entity';
import { ProductEntity } from '../products/product.entity';

@Entity({ name: 'price_lists' })
export class PriceListEntity extends BaseEntity {
  @Index()
  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description!: string | null;

  @Column({ type: 'varchar', length: 32, name: 'client_type' })
  clientType!: 'minorista' | 'mayorista' | 'distribuidor';

  @Column({ type: 'timestamptz', name: 'valid_from', nullable: true })
  validFrom!: Date | null;

  @Column({ type: 'timestamptz', name: 'valid_to', nullable: true })
  validTo!: Date | null;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive!: boolean;

  @OneToMany(() => PriceListItemEntity, (i) => i.priceList)
  items!: PriceListItemEntity[];
}

@Entity({ name: 'price_list_items' })
@Index(['priceListId', 'productId'], { unique: true })
export class PriceListItemEntity extends BaseEntity {
  @Column({ type: 'uuid', name: 'price_list_id' })
  priceListId!: string;

  @ManyToOne(() => PriceListEntity, (l) => l.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'price_list_id' })
  priceList!: PriceListEntity;

  @Column({ type: 'uuid', name: 'product_id' })
  productId!: string;

  @ManyToOne(() => ProductEntity)
  @JoinColumn({ name: 'product_id' })
  product!: ProductEntity;

  @Column({ type: 'numeric', precision: 14, scale: 2, name: 'unit_price' })
  unitPrice!: string;
}
