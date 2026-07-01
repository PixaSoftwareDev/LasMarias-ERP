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

  // Costo de referencia del insumo (dato maestro). Pre-llena el ingreso de stock.
  // Null = sin costo cargado.
  @Column({ type: 'numeric', precision: 12, scale: 4, name: 'default_cost', nullable: true })
  defaultCost!: string | null;

  // Moneda del costo de referencia (ARS/USD/EUR). Default ARS.
  @Column({ type: 'varchar', length: 3, name: 'default_cost_currency', default: 'ARS' })
  defaultCostCurrency!: string;

  // Tratamiento de IVA del costo de referencia: 'con_iva' le suma la alícuota; 'sin_iva' directo.
  @Column({ type: 'varchar', length: 8, name: 'cost_iva_mode', default: 'sin_iva' })
  costIvaMode!: string;

  // Insumo trazable (fermento, calcio, cuajo…): exige cargar el N° de lote del proveedor
  // al ingresar stock. Requerido por bromatología.
  @Column({ type: 'boolean', name: 'requires_lot_number', default: false })
  requiresLotNumber!: boolean;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive!: boolean;
}
