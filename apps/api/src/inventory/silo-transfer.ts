import Big from 'big.js';

// Pasar leche de un silo a otro (pedido del dueño, 16/11/2026). Lógica pura, verificable a mano.
//
// El silo de la leche es el `warehouse_id` de cada lote de leche cruda. Pasar litros es:
//  - Lote que se pasa ENTERO y sin tocar (inicial = saldo): cambia de silo, conserva su código.
//  - Si no: se PARTE. El lote de origen se queda con lo que ya se usó (+ lo que no se pasa) y
//    nace un lote nuevo en el silo destino con los litros pasados. Inicial y saldo del origen
//    bajan juntos, así se mantiene "inicial − usado = saldo" y la suma de los iniciales de la
//    recepción sigue dando los litros recibidos (precio del mes, editar y borrar no cambian).
//  - Se toma primero la leche más vieja (el mismo orden que el selector de elaboración).

export interface LoteDeSilo {
  id: string;
  initialQuantity: string;
  remainingQuantity: string;
  status: string;
}

export interface PasoTraspaso {
  batchId: string;
  litros: string; // decimal exacto
  modo: 'mover' | 'partir';
}

export type PlanTraspaso =
  | { ok: true; pasos: PasoTraspaso[] }
  | { ok: false; disponibles: string };

/** `lotes` ya vienen ordenados del más viejo al más nuevo. */
export function planSiloTransfer(lotes: LoteDeSilo[], litros: number | string): PlanTraspaso {
  const conLeche = lotes.filter((l) => new Big(l.remainingQuantity).gt(0));
  const disponibles = conLeche.reduce((a, l) => a.plus(l.remainingQuantity), new Big(0));
  let falta = new Big(litros);
  if (falta.gt(disponibles)) return { ok: false, disponibles: disponibles.toString() };

  const pasos: PasoTraspaso[] = [];
  for (const l of conLeche) {
    if (falta.lte(0)) break;
    const saldo = new Big(l.remainingQuantity);
    const toma = falta.lt(saldo) ? falta : saldo;
    const entero = toma.eq(saldo) && saldo.eq(l.initialQuantity) && l.status === 'activo';
    pasos.push({ batchId: l.id, litros: toma.toString(), modo: entero ? 'mover' : 'partir' });
    falta = falta.minus(toma);
  }
  return { ok: true, pasos };
}

/**
 * Código del lote nuevo que nace al partir. Si la leche es de una recepción, sigue su
 * numeración (LM-LC-…-0003 → …-0003-2, o …-0003-1/-2 → …-0003-3). Si no, se sufija el lote
 * de origen con P1, P2… Nunca repite un código existente.
 */
export function codigoLoteTraspaso(
  origen: string,
  recepcion: { code: string; lotCodes: string[] } | null,
  existe: (code: string) => boolean,
): string {
  if (recepcion) {
    const pref = `${recepcion.code}-`;
    const usados = recepcion.lotCodes.map((c) => (c === recepcion.code ? 1 : c.startsWith(pref) ? Number(c.slice(pref.length)) : 0));
    let n = Math.max(1, ...usados.filter((x) => Number.isInteger(x))) + 1;
    while (existe(`${pref}${n}`)) n += 1;
    return `${pref}${n}`;
  }
  let n = 1;
  while (existe(`${origen}-P${n}`)) n += 1;
  return `${origen}-P${n}`;
}
