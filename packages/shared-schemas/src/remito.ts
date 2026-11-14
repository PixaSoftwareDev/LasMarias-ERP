import type { PriceBasis, SalesOrderLine } from './sales';

// Renglones del remito (pedido del dueño, 12/11/2026): el cliente tiene que ver UN renglón por
// producto ("MASA 701 kg, 44 bultos"), aunque en la venta haya salido de dos lotes o se haya
// cargado en dos renglones (ventas viejas, como DSP-000166). Se juntan los renglones del mismo
// producto cobrados igual (mismo precio y misma base); si el precio difiere, quedan separados
// para que el importe se pueda controlar a mano. Sumas exactas en milésimas y centavos.

export interface LoteDelRenglon {
  batchCode: string;
  quantity: number;
  bultos?: number;
}

export interface RenglonRemito {
  productId: string;
  productName: string;
  sku: string;
  unit: string;
  unitPrice: number;
  priceBasis?: PriceBasis;
  fatPct?: number;
  fatBasePrice?: number;
  quantity: number;
  bultos?: number; // ausente = ningún renglón llevaba bultos
  subtotal: number;
  lotes: LoteDelRenglon[]; // de qué lotes salió (vacío en ventas viejas automáticas)
}

const mil = (n: number) => Math.round(n * 1000);
const cent = (n: number) => Math.round(n * 100);

// Lotes de un renglón: los que guardó la venta (desde nov 2026) o, en ventas viejas, el lote
// elegido a mano si lo había.
function lotesDe(l: SalesOrderLine): LoteDelRenglon[] {
  if (l.lotes) return l.lotes.map((x) => ({ batchCode: x.batchCode ?? '', quantity: x.quantity, bultos: x.bultos }));
  return l.batchCode ? [{ batchCode: l.batchCode, quantity: l.quantity, bultos: l.bultos }] : [];
}

export function agruparRenglones(lines: SalesOrderLine[]): RenglonRemito[] {
  const grupos = new Map<string, RenglonRemito>();
  for (const l of lines) {
    const clave = [l.productId, l.unitPrice, l.priceBasis ?? 'unidad', l.fatPct ?? '', l.fatBasePrice ?? ''].join('|');
    const g = grupos.get(clave);
    if (!g) {
      grupos.set(clave, {
        productId: l.productId,
        productName: l.productName,
        sku: l.sku,
        unit: l.unit,
        unitPrice: l.unitPrice,
        priceBasis: l.priceBasis,
        fatPct: l.fatPct,
        fatBasePrice: l.fatBasePrice,
        quantity: l.quantity,
        bultos: l.bultos,
        subtotal: l.subtotal,
        lotes: lotesDe(l),
      });
      continue;
    }
    g.quantity = (mil(g.quantity) + mil(l.quantity)) / 1000;
    g.subtotal = (cent(g.subtotal) + cent(l.subtotal)) / 100;
    if (l.bultos != null) g.bultos = (g.bultos ?? 0) + l.bultos;
    for (const lote of lotesDe(l)) {
      const igual = g.lotes.find((x) => x.batchCode === lote.batchCode);
      if (!igual) g.lotes.push(lote);
      else {
        igual.quantity = (mil(igual.quantity) + mil(lote.quantity)) / 1000;
        if (lote.bultos != null) igual.bultos = (igual.bultos ?? 0) + lote.bultos;
      }
    }
  }
  return [...grupos.values()];
}
