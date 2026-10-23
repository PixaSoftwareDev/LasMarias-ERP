// Orden de salida de los lotes: "el más viejo primero" (pedido del dueño, oct 2026).
// Primero el que vence antes; los que no tienen vencimiento van después, por fecha de
// elaboración. En la base real ningún lote de queso ni de masa tiene vencimiento, así que
// ordenar solo por vencimiento (como antes) dejaba el orden librado al azar de Postgres.
// Desempate por código para que el orden sea siempre el mismo.
export interface OldestFirstBatch {
  code: string;
  expirationDate?: Date | null;
  productionDate?: Date | null;
}

const time = (d?: Date | null) => (d ? new Date(d).getTime() : Number.POSITIVE_INFINITY);

export function sortOldestFirst<T extends OldestFirstBatch>(batches: T[]): T[] {
  return [...batches].sort(
    (a, b) =>
      time(a.expirationDate) - time(b.expirationDate) ||
      time(a.productionDate) - time(b.productionDate) ||
      a.code.localeCompare(b.code),
  );
}
