import Big from 'big.js';
import type { SalesOrderLine } from '@lasmarias/shared-schemas';
import { planFefoAllocation, type FefoAllocation } from './fefo-plan';

// Devoluciones — cuentas puras, sin base (CLAUDE.md §8: lógica de dominio testeable a mano).
//
// Una venta puede tener el mismo producto en más de un renglón (ej. DSP-000166: dos renglones
// de masa, uno por lote). Por eso lo devuelto se controla POR RENGLÓN, no por producto: si se
// buscaba "el renglón del producto" se tomaba siempre el primero.

export interface Devuelto {
  productId: string;
  quantity: number;
  // Renglón de la venta al que corresponde. Las notas de crédito viejas no lo tienen.
  lineIndex?: number;
}

// Cuánto queda por devolver de cada renglón: lo vendido menos lo que ya volvió. Lo devuelto sin
// renglón (notas de crédito viejas) se descuenta de los renglones de ese producto, en orden.
export function pendientePorRenglon(lines: SalesOrderLine[], devueltos: Devuelto[]): Big[] {
  const pendiente = lines.map((l) => new Big(l.quantity));
  for (const d of devueltos) {
    if (d.lineIndex != null && pendiente[d.lineIndex]) {
      pendiente[d.lineIndex] = pendiente[d.lineIndex]!.minus(d.quantity);
      continue;
    }
    let resto = new Big(d.quantity);
    lines.forEach((l, i) => {
      if (l.productId !== d.productId || resto.lte(0) || pendiente[i]!.lte(0)) return;
      const toma = pendiente[i]!.lt(resto) ? pendiente[i]! : resto;
      pendiente[i] = pendiente[i]!.minus(toma);
      resto = resto.minus(toma);
    });
  }
  return pendiente;
}

export interface MovimientoDeLote {
  batchId: string;
  quantity: number | string;
  bultos: number | null;
  type: 'in' | 'out';
}

export interface Devolvible {
  batchId: string;
  quantity: number;
  bultos: number | null; // null = de ese lote salieron sin contar bultos
}

// Lo que todavía puede volver a cada lote: lo que salió de él por esta venta menos lo que ya
// volvió por devoluciones anteriores. Sin esto, una segunda devolución podía reponerle a un
// lote más de lo que había entregado.
export function devolviblePorLote(movimientos: MovimientoDeLote[]): Devolvible[] {
  const porLote = new Map<string, { quantity: Big; bultos: number | null }>();
  for (const m of movimientos) {
    const signo = m.type === 'out' ? 1 : -1;
    const actual = porLote.get(m.batchId) ?? { quantity: new Big(0), bultos: null };
    actual.quantity = actual.quantity.plus(new Big(m.quantity).times(signo));
    if (m.bultos != null) actual.bultos = (actual.bultos ?? 0) + signo * m.bultos;
    porLote.set(m.batchId, actual);
  }
  return [...porLote.entries()]
    .filter(([, v]) => v.quantity.gt(0))
    .map(([batchId, v]) => ({
      batchId,
      quantity: v.quantity.toNumber(),
      bultos: v.bultos == null ? null : Math.max(0, v.bultos),
    }));
}

// A qué lotes vuelve una cantidad devuelta: primero a los lotes de los que salió ESE renglón
// (si los eligieron a mano), después al resto, sin pasar lo devolvible de cada uno.
export function planReposicion(
  quantity: number,
  devolvibles: Devolvible[],
  lotesDelRenglon: string[],
): { allocations: FefoAllocation[]; shortage: number } {
  const propios = devolvibles.filter((d) => lotesDelRenglon.includes(d.batchId));
  const otros = devolvibles.filter((d) => !lotesDelRenglon.includes(d.batchId));
  return planFefoAllocation(
    quantity,
    [...propios, ...otros].map((d) => ({ id: d.batchId, remaining: d.quantity })),
  );
}

// Lotes que se eligieron a mano para un renglón (vacío = salió por "el más viejo primero").
export function lotesDelRenglon(line: SalesOrderLine): string[] {
  if (line.lotes) return line.lotes.map((x) => x.batchId);
  return line.batchId ? [line.batchId] : [];
}
