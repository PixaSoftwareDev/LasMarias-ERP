/**
 * Migración de datos puntual: el tipo de cliente "distribuidor" se eliminó del
 * sistema (ahora solo Minorista / Mayorista). Este script reasigna a "mayorista"
 * los clientes y los precios que hayan quedado como "distribuidor".
 *
 * Uso:  pnpm --filter api fix:client-types
 *
 * Es IDEMPOTENTE (correrlo dos veces no rompe nada) y NO destructivo: solo cambia
 * el tipo. Para los precios evita dejar dos filas vigentes del mismo producto:
 * si ya hay un precio mayorista vigente, el de distribuidor se desactiva (el
 * mayorista manda); si no, se reasigna a mayorista.
 */

import 'reflect-metadata';
import 'dotenv/config';
import AppDataSource from './data-source';

async function run() {
  await AppDataSource.initialize();
  await AppDataSource.transaction(async (manager) => {
    // 1) Clientes: distribuidor → mayorista.
    const clients = await manager.query(
      `UPDATE clients SET type = 'mayorista' WHERE type = 'distribuidor'`,
    );
    const clientsCount = Array.isArray(clients) ? clients[1] : clients;

    // 2) Precios distribuidor que chocarían con un mayorista vigente del mismo
    //    producto → se desactivan (el mayorista ya tiene su precio).
    await manager.query(`
      UPDATE price_list_items d
      SET is_active = false
      WHERE d.client_type = 'distribuidor'
        AND d.is_active = true
        AND EXISTS (
          SELECT 1 FROM price_list_items m
          WHERE m.client_type = 'mayorista'
            AND m.is_active = true
            AND m.product_id = d.product_id
        )
    `);

    // 3) El resto de los precios distribuidor (sin mayorista vigente) → mayorista.
    const prices = await manager.query(
      `UPDATE price_list_items SET client_type = 'mayorista' WHERE client_type = 'distribuidor'`,
    );
    const pricesCount = Array.isArray(prices) ? prices[1] : prices;

    console.log(`[fix-client-types] ✓ Clientes reasignados: ${clientsCount ?? 0}`);
    console.log(`[fix-client-types] ✓ Precios reasignados a mayorista: ${pricesCount ?? 0}`);
  });
  await AppDataSource.destroy();
}

run().catch((e) => {
  console.error('[fix-client-types] Error:', e?.message ?? e);
  process.exit(1);
});
