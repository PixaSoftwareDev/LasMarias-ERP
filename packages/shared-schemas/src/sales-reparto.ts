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
  if (filas.some((f) => f.batchId && !(f.quantity > 0)))
    errores.push(`Cargá los ${unidad} de cada lote.`);
  for (const f of filas) {
    const lote = lotes.find((l) => l.batchId === f.batchId);
    if (!lote) continue;
    if (toMil(f.quantity) > toMil(lote.remaining))
      errores.push(`El lote ${lote.batchCode} tiene ${fmt(lote.remaining)} ${unidad}.`);
    if (f.bultos != null && lote.bultos != null && f.bultos > lote.bultos)
      avisos.push(
        `El lote ${lote.batchCode} figura con ${lote.bultos} bultos y pusiste ${f.bultos}.`,
      );
  }
  const faltanMil = toMil(total) - kgMil;
  if (faltanMil > 0) errores.push(`Faltan repartir ${fmt(fromMil(faltanMil))} ${unidad}.`);
  if (faltanMil < 0)
    errores.push(`Te pasaste ${fmt(fromMil(-faltanMil))} ${unidad} del total del renglón.`);
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
  const faltaMil =
    toMil(total) - otras.reduce((acc, f) => acc + (f.quantity > 0 ? toMil(f.quantity) : 0), 0);
  if (faltaMil <= 0) return null;
  const tomaMil = Math.min(faltaMil, toMil(lote.remaining));
  const quantity = fromMil(tomaMil);
  if (tomaMil === toMil(lote.remaining) && lote.bultos != null)
    return { quantity, bultos: lote.bultos };
  if (tomaMil === faltaMil && totalBultos != null) {
    const faltanBultos = totalBultos - otras.reduce((acc, f) => acc + (f.bultos ?? 0), 0);
    if (faltanBultos >= 0) return { quantity, bultos: faltanBultos };
  }
  return { quantity };
}

// Con qué filas arranca "Repartir entre varios lotes". Si ya había un lote elegido, entra con
// lo que ese lote puede dar y deja una fila libre para el resto (audio del dueño, 27/11/2026:
// puso el total, eligió un lote y no supo cómo seguir).
export function repartoInicial(
  total: number,
  totalBultos: number | undefined,
  elegido?: LoteDisponible,
): FilaReparto[] {
  const vacia: FilaReparto = { batchId: '', quantity: 0 };
  if (!elegido) return [vacia];
  const primera: FilaReparto = { batchId: elegido.batchId, quantity: 0 };
  Object.assign(primera, filaSugerida(total, totalBultos, [primera], 0, elegido));
  return toMil(primera.quantity) < toMil(total) ? [primera, vacia] : [primera];
}

// Un renglón de venta, en lo que hace falta para juntar dos del mismo producto.
export interface RenglonLotes {
  quantity: number;
  bultos?: number;
  batchId?: string;
  lotes?: FilaReparto[];
}

// Junta dos renglones del mismo producto en uno: suma kg y bultos, y arma el reparto con los
// lotes que cada renglón tenía elegidos. Si ninguno eligió lote, queda en "el más viejo
// primero". Si uno solo eligió, lo del otro queda como "faltan repartir" para que lo complete.
export function juntarRenglones(a: RenglonLotes, b: RenglonLotes): RenglonLotes {
  const quantity = fromMil(toMil(a.quantity) + toMil(b.quantity));
  const bultos =
    a.bultos == null && b.bultos == null ? undefined : (a.bultos ?? 0) + (b.bultos ?? 0);
  const filasDe = (r: RenglonLotes): FilaReparto[] =>
    r.lotes ?? (r.batchId ? [{ batchId: r.batchId, quantity: r.quantity, bultos: r.bultos }] : []);
  const filas: FilaReparto[] = [];
  for (const f of [...filasDe(a), ...filasDe(b)]) {
    const misma = f.batchId ? filas.find((o) => o.batchId === f.batchId) : undefined;
    if (!misma) {
      filas.push({ ...f });
      continue;
    }
    // El mismo lote en los dos renglones: una sola fila con la suma.
    misma.quantity = fromMil(toMil(misma.quantity) + toMil(f.quantity));
    if (misma.bultos != null || f.bultos != null)
      misma.bultos = (misma.bultos ?? 0) + (f.bultos ?? 0);
  }
  if (filas.length === 0) return { quantity, bultos };
  return { quantity, bultos, lotes: filas };
}
