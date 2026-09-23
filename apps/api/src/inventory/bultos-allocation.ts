// Reparto de BULTOS entre los lotes que ya eligió el FEFO por kg.
//
// El problema: los kg se parten con decimales, pero los bultos son enteros. Si de 1392,7 kg
// se despachan 700 kg tomando 500 de un lote y 200 de otro, ¿cuántos bultos salen de cada uno?
// Se reparten proporcional a los kg y el resto se asigna por "restos mayores" (el lote con
// la fracción más grande se lleva el bulto que sobra), de modo que la suma dé EXACTA.
//
// Además ningún lote puede entregar más bultos de los que tiene: lo que no entra se
// reasigna al siguiente lote con lugar. Si aun así sobran bultos, se devuelven en
// `unassigned` (el que llama avisa; nunca se pierde ni se inventa un bulto).
//
// Función pura, sin base de datos — se testea a mano (CLAUDE.md §8).

export interface BultosShare {
  /** kg (o unidad) que se toman de este lote — define la proporción. */
  quantity: number;
  /** Bultos disponibles en el lote. null = el lote no lleva bultos contados. */
  available: number | null;
}

export interface BultosAllocationResult {
  /** Bultos asignados a cada lote, en el mismo orden que entró. */
  bultos: number[];
  /** Bultos que no se pudieron asignar porque los lotes no tenían saldo. */
  unassigned: number;
}

// Cuántos bultos se lleva quien toma `taken` de un lote que tiene `remainingQuantity` y
// `remainingBultos`. Se usa cuando NADIE cargó los bultos a mano (consumo de masa en una
// elaboración, baja por merma): mantiene el saldo de bultos al día en vez de dejarlo viejo.
// Si se lleva todo el lote, se lleva todos los bultos — sin restos raros por redondeo.
export function bultosForQuantity(
  taken: number,
  remainingQuantity: number,
  remainingBultos: number | null,
): number | null {
  if (remainingBultos == null) return null;
  if (!(remainingQuantity > 0) || !(taken > 0)) return 0;
  if (taken >= remainingQuantity) return remainingBultos;
  return Math.min(remainingBultos, Math.round((taken / remainingQuantity) * remainingBultos));
}

export function allocateBultos(totalBultos: number, shares: BultosShare[]): BultosAllocationResult {
  if (!(totalBultos > 0) || shares.length === 0) {
    return { bultos: shares.map(() => 0), unassigned: Math.max(0, totalBultos) };
  }

  const totalQuantity = shares.reduce((acc, s) => acc + Math.max(0, s.quantity), 0);
  if (totalQuantity <= 0) return { bultos: shares.map(() => 0), unassigned: totalBultos };

  // 1. Parte entera proporcional a los kg, guardando la fracción de cada lote.
  const rows = shares.map((s, i) => {
    const exact = (Math.max(0, s.quantity) / totalQuantity) * totalBultos;
    const floor = Math.floor(exact);
    return { i, cap: s.available, given: floor, rest: exact - floor };
  });

  // 2. Los bultos que sobran por el redondeo van a las fracciones más grandes.
  let leftover = totalBultos - rows.reduce((acc, r) => acc + r.given, 0);
  for (const r of [...rows].sort((a, b) => b.rest - a.rest || a.i - b.i)) {
    if (leftover <= 0) break;
    r.given += 1;
    leftover -= 1;
  }

  // 3. Tope por lote: nadie entrega más bultos de los que tiene. Lo que sobra se
  //    reasigna a los lotes con lugar (en orden FEFO, que es el orden de entrada).
  let excess = 0;
  for (const r of rows) {
    if (r.cap != null && r.given > r.cap) {
      excess += r.given - r.cap;
      r.given = r.cap;
    }
  }
  for (const r of rows) {
    if (excess <= 0) break;
    const room = r.cap == null ? excess : r.cap - r.given;
    if (room <= 0) continue;
    const take = Math.min(room, excess);
    r.given += take;
    excess -= take;
  }

  return { bultos: rows.map((r) => r.given), unassigned: excess };
}
