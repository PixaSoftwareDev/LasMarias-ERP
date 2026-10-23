import { IsNull, Not, type Repository } from 'typeorm';
import type { Currency } from '@lasmarias/shared-schemas';
import type { BatchEntity } from '../batches/batch.entity';
import type { ProductEntity } from '../products/product.entity';

// ¿A qué costo entra un lote como ORIGEN de una orden (leche, masa, crema, queso para
// reproceso)? Regla única: la usan el cierre de la orden (calculadora) y la pantalla que
// lo avisa antes de abrirla, así nunca dicen cosas distintas.
//   1. Masa con "precio de masa" cargado en la ficha → ese precio (pedidos #14/#15).
//   2. El costo propio del lote (leche: $/litro de la recepción; masa/queso: costo del cierre).
//   3. Lote sin costo (stock cargado a mano): el costo de referencia de la ficha.
//   4. Sin ficha: el costo del último lote PRODUCIDO de ese mismo producto.
//   5. Nada de lo anterior: $0, y la pantalla lo avisa.
export type InputCostSource = 'lote' | 'precio_masa' | 'ficha' | 'ultimo_lote' | 'sin_costo';

export interface ResolvedInputCost {
  unitCost: string; // $ por unidad del lote, decimal como string
  source: InputCostSource;
  fromLotCode?: string; // solo con source 'ultimo_lote'
}

export interface InputCostDeps {
  batches: Repository<BatchEntity>;
  toArs: (amount: number | string, currency: Currency, date: Date) => Promise<number>;
}

// Costo de referencia de la ficha en pesos del día (USD/EUR se convierten). null = sin costo.
async function referenceCostArs(deps: InputCostDeps, product: ProductEntity, fecha: Date): Promise<string | null> {
  if (product.defaultCost == null || String(product.defaultCost) === '') return null;
  const currency = (product.defaultCostCurrency ?? 'ARS') as Currency;
  return currency === 'ARS' ? String(product.defaultCost) : String(await deps.toArs(product.defaultCost, currency, fecha));
}

export async function resolveInputCost(
  deps: InputCostDeps,
  batch: Pick<BatchEntity, 'unitCost' | 'productId'>,
  product: ProductEntity | null,
  fecha: Date,
): Promise<ResolvedInputCost> {
  // La ficha se consulta solo si se va a usar: convertir un costo en USD sin cotización
  // cargada tira error, y eso no puede frenar el cierre por un dato que no se usa.
  if (product?.category === 'intermedio') {
    const precioMasa = await referenceCostArs(deps, product, fecha);
    if (precioMasa != null) return { unitCost: precioMasa, source: 'precio_masa' };
  }
  if (batch.unitCost != null) return { unitCost: String(batch.unitCost), source: 'lote' };
  if (product) {
    const ficha = await referenceCostArs(deps, product, fecha);
    if (ficha != null) return { unitCost: ficha, source: 'ficha' };
  }
  if (batch.productId) {
    const ultimo = await deps.batches.findOne({
      where: { productId: batch.productId, unitCost: Not(IsNull()) },
      order: { productionDate: 'DESC', createdAt: 'DESC' },
    });
    if (ultimo?.unitCost != null)
      return { unitCost: String(ultimo.unitCost), source: 'ultimo_lote', fromLotCode: ultimo.code };
  }
  return { unitCost: '0', source: 'sin_costo' };
}
