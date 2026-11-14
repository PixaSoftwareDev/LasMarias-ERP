// Ayuda de carga para un renglón de venta repartido entre lotes (pedido del dueño, 12/11/2026):
// carga el total del renglón (701 kg, 44 bultos) y después de qué lote sale cada parte. La
// pantalla le va diciendo lo que falta, como con los tambos en la recepción de leche.
// El control definitivo lo hace el backend (reparto-lotes.ts) en decimal exacto.

export interface FilaReparto {
  batchId: string;
  quantity: number;
  bultos?: number;
}

export interface LoteDisponible {
  batchId: string;
  batchCode: string;
  remaining: number;
  bultos?: number | null;
}

export interface ResumenReparto {
  kg: number; // kg repartidos hasta ahora
  faltanKg: number; // negativo = se pasó
  bultos: number | null; // bultos repartidos (null si ninguna fila los tiene)
  // Lo que impide guardar, en palabras del usuario.
  errores: string[];
  // Lo que conviene revisar pero no frena (el saldo de bultos del lote puede estar desfasado).
  avisos: string[];
}

// Sumas exactas en milésimas (enteros): 0,1 + 0,2 da 0,3. Los lotes guardan 3 decimales.
const toMil = (n: number) => Math.round(n * 1000);
const fromMil = (m: number) => m / 1000;
const fmt = (n: number) => n.toLocaleString('es-AR', { maximumFractionDigits: 3 });

export function resumenReparto(
  total: number,
  totalBultos: number | undefined,
  filas: FilaReparto[],
  lotes: LoteDisponible[],
  unidad: string,
): ResumenReparto {
  const errores: string[] = [];
  const avisos: string[] = [];
  const kgMil = filas.reduce((acc, f) => acc + (f.quantity > 0 ? toMil(f.quantity) : 0), 0);
  const conBultos = filas.some((f) => f.bultos != null);
  const bultos = conBultos ? filas.reduce((acc, f) => acc + (f.bultos ?? 0), 0) : null;

  if (filas.some((f) => !f.batchId)) errores.push('Elegí el lote en cada fila.');
  if (filas.some((f) => f.batchId && !(f.quantity > 0))) errores.push(`Cargá los ${unidad} de cada lote.`);
  for (const f of filas) {
    const lote = lotes.find((l) => l.batchId === f.batchId);
    if (!lote) continue;
    if (toMil(f.quantity) > toMil(lote.remaining))
      errores.push(`El lote ${lote.batchCode} tiene ${fmt(lote.remaining)} ${unidad}.`);
    if (f.bultos != null && lote.bultos != null && f.bultos > lote.bultos)
      avisos.push(`El lote ${lote.batchCode} figura con ${lote.bultos} bultos y pusiste ${f.bultos}.`);
  }
  const faltanMil = toMil(total) - kgMil;
  if (faltanMil > 0) errores.push(`Faltan repartir ${fmt(fromMil(faltanMil))} ${unidad}.`);
  if (faltanMil < 0) errores.push(`Te pasaste ${fmt(fromMil(-faltanMil))} ${unidad} del total del renglón.`);
  // Los bultos se marcan cuando los kg ya cierran: mientras se reparte, "Llevás X de Y" alcanza.
  if (faltanMil === 0 && bultos != null && totalBultos != null && bultos !== totalBultos)
    errores.push(`Los bultos repartidos suman ${bultos} y el renglón dice ${totalBultos}.`);

  return { kg: fromMil(kgMil), faltanKg: fromMil(faltanMil), bultos, errores, avisos };
}

// Qué proponer al elegir un lote en una fila vacía: lo que falta, sin pasar lo que tiene el lote.
// Bultos: si se lleva el lote entero, todos los del lote; si con esta fila se completa el
// renglón, los bultos que faltan. Si no, no se adivina.
export function filaSugerida(
  total: number,
  totalBultos: number | undefined,
  filas: FilaReparto[],
  idx: number,
  lote: LoteDisponible,
): { quantity: number; bultos?: number } | null {
  if (filas[idx]!.quantity > 0) return null;
  const otras = filas.filter((_, i) => i !== idx);
  const faltaMil = toMil(total) - otras.reduce((acc, f) => acc + (f.quantity > 0 ? toMil(f.quantity) : 0), 0);
  if (faltaMil <= 0) return null;
  const tomaMil = Math.min(faltaMil, toMil(lote.remaining));
  const quantity = fromMil(tomaMil);
  if (tomaMil === toMil(lote.remaining) && lote.bultos != null) return { quantity, bultos: lote.bultos };
  if (tomaMil === faltaMil && totalBultos != null) {
    const faltanBultos = totalBultos - otras.reduce((acc, f) => acc + (f.bultos ?? 0), 0);
    if (faltanBultos >= 0) return { quantity, bultos: faltanBultos };
  }
  return { quantity };
}
