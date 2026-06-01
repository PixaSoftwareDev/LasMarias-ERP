/**
 * RESET de datos transaccionales para demo. Vacía recepciones, producción, stock,
 * despachos, cuenta corriente y caja, dejando intactos los MAESTROS (usuarios,
 * productos, clientes, tambos, cámaras, recetas, listas de precio).
 *
 * Uso:  pnpm --filter api reset:demo
 *
 * ⚠ DESTRUCTIVO. Pensado solo para entornos de demo/capacitación. Reusa la misma
 * conexión que la app (variables de entorno), así que apunta a la base configurada.
 */

import 'reflect-metadata';
import 'dotenv/config';
import AppDataSource from './data-source';

// Solo lo transaccional. NO se tocan: users, products, clients, producers,
// warehouses, recipes, recipe_versions, price_list_items, migrations.
const TRANSACTIONAL = [
  'inventory_movements',
  'batches',
  'milk_receptions',
  'production_orders',
  'sales_orders',
  'account_movements',
  'credit_notes',
  'cash_movements',
];

async function reset() {
  await AppDataSource.initialize();
  const list = TRANSACTIONAL.map((t) => `"${t}"`).join(', ');
  await AppDataSource.query(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
  console.log(`[reset-demo] ✓ Vaciadas: ${TRANSACTIONAL.join(', ')}`);
  console.log('[reset-demo] Maestros (usuarios, productos, clientes, tambos, cámaras, recetas, precios) intactos.');
  await AppDataSource.destroy();
}

reset().catch((e) => {
  console.error('[reset-demo] Error:', e?.message ?? e);
  process.exit(1);
});
