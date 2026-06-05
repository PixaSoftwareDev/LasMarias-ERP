import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import type { ClientType } from '@lasmarias/shared-schemas';
import { BaseEntity } from '../database/base.entity';
import { ProductEntity } from '../products/product.entity';

// Precio por (tipo de cliente, producto). Sin vigencias complejas: la fila vigente
// es is_active = true. El upsert masivo desactiva las viejas y crea las nuevas.
@Entity({ name: 'price_list_items' })
export class PriceListItemEntity extends BaseEntity {
  @Column({ type: 'varchar', length: 32, name: 'client_type' })
  clientType!: ClientType;

  @Column({ type: 'uuid', name: 'product_id' })
  productId!: string;

  @ManyToOne(() => ProductEntity)
  @JoinColumn({ name: 'product_id' })
  product!: ProductEntity;

  @Column({ type: 'numeric', precision: 14, scale: 2, name: 'unit_price' })
  unitPrice!: string;

  // Moneda en que está cargado el precio (ARS/USD/EUR). Default ARS.
  @Column({ type: 'varchar', length: 3, default: 'ARS' })
  currency!: string;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive!: boolean;
}
