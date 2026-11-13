import Big from 'big.js';

// Asignación FEFO pura: dada la cantidad pedida y los lotes (ya ordenados por
// vencimiento más próximo primero), devuelve cuánto tomar de cada lote y el faltante.
// Sin efectos: se testea sin tocar la base (CLAUDE.md §8 — lógica de dominio testeable).
export interface FefoBatchInput {
  id: string;
  remaining: number;
}
export interface FefoAllocation {
  batchId: string;
  take: number;
  remainingAfter: number;
}
export interface FefoPlan {
  allocations: FefoAllocation[];
  shortage: number; // cantidad que no se pudo cubrir (0 si alcanzó)
}

// Las cuentas van en DECIMAL EXACTO (big.js): en float, 869,2 − 709,9 − 159,3 daba
// 0,0000000000000568 y el despacho se frenaba con "faltan 0" (crema, oct 2026).
export function planFefoAllocation(quantity: number, batches: FefoBatchInput[]): FefoPlan {
  let pending = new Big(quantity);
  const allocations: FefoAllocation[] = [];
  for (const batch of batches) {
    if (pending.lte(0)) break;
    const available = new Big(batch.remaining);
    if (available.lte(0)) continue;
    const take = available.lt(pending) ? available : pending;
    allocations.push({
      batchId: batch.id,
      take: take.toNumber(),
      remainingAfter: available.minus(take).toNumber(),
    });
    pending = pending.minus(take);
  }
  return { allocations, shortage: pending.gt(0) ? pending.toNumber() : 0 };
}
