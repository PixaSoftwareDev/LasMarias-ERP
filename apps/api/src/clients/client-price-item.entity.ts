import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../database/base.entity';
import { ProductEntity } from '../products/product.entity';

// Precio particular por (cliente, producto): override sobre la lista por tipo de cliente.
// La fila vigente es is_active = true; el upsert desactiva las viejas y crea las nuevas.
@Entity({ name: 'client_price_items' })
export class ClientPriceItemEntity extends BaseEntity {
  @Index()
  @Column({ type: 'uuid', name: 'client_id' })
  clientId!: string;

  @Column({ type: 'uuid', name: 'product_id' })
  productId!: string;

  @ManyToOne(() => ProductEntity)
  @JoinColumn({ name: 'product_id' })
  product!: ProductEntity;

  @Column({ type: 'numeric', precision: 14, scale: 2, name: 'unit_price' })
  unitPrice!: string;

  @Column({ type: 'varchar', length: 3, default: 'ARS' })
  currency!: string;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive!: boolean;
}
