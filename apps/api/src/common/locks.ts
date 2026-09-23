import type { EntityManager } from 'typeorm';

// Candados de base de datos. Existen por un motivo concreto y verificado (jul 2026):
// sin ellos, dos cargas simultáneas leen el mismo saldo, calculan sobre él y la segunda
// PISA a la primera. En una prueba real, 8 órdenes abiertas a la vez se llevaron 8.000 L
// de un lote de 5.000 y el lote solo bajó 1.000: leche fantasma y descuadre.
//
// Regla del sistema: TODA operación que lea el saldo de un lote para después modificarlo
// tiene que bloquear ese lote primero. El bloqueo dura hasta el fin de la transacción.

/**
 * Bloquea los lotes indicados hasta que termine la transacción (SELECT ... FOR UPDATE).
 * Si otra operación los tiene tomados, esta espera su turno y después lee el saldo REAL.
 *
 * Los ordena por id siempre igual: si dos operaciones tocan los mismos lotes en orden
 * distinto, la base se traba (deadlock). Ordenando, una espera a la otra y listo.
 */
export async function lockBatches(manager: EntityManager, batchIds: string[]): Promise<void> {
  const ids = [...new Set(batchIds.filter(Boolean))];
  if (ids.length === 0) return;
  await manager.query('SELECT id FROM batches WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE', [ids]);
}

/**
 * Bloquea todos los lotes de un producto que están disponibles (los candidatos del FEFO).
 * Se usa cuando no sabemos de antemano de qué lote va a salir la mercadería: despacho,
 * baja por merma, consumo de insumos. Devuelve los ids bloqueados.
 */
export async function lockBatchesOfProduct(manager: EntityManager, productId: string): Promise<string[]> {
  const rows: Array<{ id: string }> = await manager.query(
    `SELECT id FROM batches WHERE product_id = $1 AND status IN ('activo', 'en_proceso') ORDER BY id FOR UPDATE`,
    [productId],
  );
  return rows.map((r) => r.id);
}

/** Bloquea una fila de una tabla por id (ej. la orden que se está por cerrar). */
export async function lockRow(
  manager: EntityManager,
  table: 'production_orders' | 'sales_orders' | 'warehouses',
  id: string,
) {
  await manager.query(`SELECT id FROM ${table} WHERE id = $1 FOR UPDATE`, [id]);
}

/**
 * Serializa las cargas IDÉNTICAS entre sí (doble click, doble envío, dos pestañas).
 *
 * Las guardas anti-duplicado del sistema ("ya cargaste hoy este ingreso") leen y después
 * escriben: si los dos envíos llegan juntos, ninguno ve al otro y entran los dos. Con este
 * candado, el segundo envío igual espera al primero y RECIÉN AHÍ hace la consulta, así que
 * lo ve y avisa. Cargas distintas no se estorban: cada firma tiene su propio candado.
 *
 * Usa la forma de dos enteros de pg_advisory_xact_lock, que vive en un espacio de candados
 * distinto al de la numeración de códigos (que usa la forma de un entero). No se pisan.
 */
export async function lockDuplicateSignature(manager: EntityManager, firma: string): Promise<void> {
  await manager.query('SELECT pg_advisory_xact_lock(1, hashtext($1))', [firma]);
}
