// Cálculo puro de los cargos (lo que se le debe a cada tambo) de una recepción.
// Multi-tambo (pedido #17): una descarga puede repartirse entre varios tambos, cada uno
// con sus litros y su precio congelado. Las recepciones viejas single-tambo no tienen
// `lines`: se usa el costo del lote (batchUnitCost) sobre el productor de la recepción.

export interface ReceptionChargeInput {
  producerId: string; // tambo primario / de la recepción vieja
  liters: number; // litros totales de la recepción (para el fallback)
  batchUnitCost?: number | null; // $/litro del lote (fallback single-tambo)
  lines?: { producerId: string; liters: number; pricePerLiter?: number }[];
}

export interface ReceptionCharge {
  producerId: string;
  liters: number;
  price: number; // $/litro
  amount: number; // liters × price
}

export function receptionCharges(r: ReceptionChargeInput): ReceptionCharge[] {
  if (r.lines && r.lines.length > 0) {
    return r.lines.map((l) => {
      const price = l.pricePerLiter ?? 0;
      return { producerId: l.producerId, liters: l.liters, price, amount: l.liters * price };
    });
  }
  const price = r.batchUnitCost != null ? r.batchUnitCost : 0;
  return [{ producerId: r.producerId, liters: r.liters, price, amount: r.liters * price }];
}
