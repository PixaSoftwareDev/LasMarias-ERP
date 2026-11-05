-- La crema cruda (CLNP) vuelve a ser SUBPRODUCTO (pedido del dueño, audio 04/11/2026).
-- El 29/10 quedó como "intermedio" (cambio hecho para poder crearle una receta propia, el
-- camino que después se descartó) y eso la escondió del selector "Crema u otro subproducto
-- en stock" de produccion/nueva: solo aparecía la ricotta, ni los lotes LM-AJ cargados a
-- mano ni el lote nuevo del "guardar lo de hoy". Como subproducto además vuelve a mostrar
-- el tilde "precio por % de grasa" en su ficha de Productos.
-- Idempotente. Correr en prod junto con el deploy del lote inmediato de "Guardar lo de hoy".
BEGIN;
UPDATE products SET category = 'subproducto' WHERE sku = 'CLNP' AND category <> 'subproducto';
SELECT sku, name, category, priced_by_fat FROM products WHERE sku IN ('CLNP', 'CDL');
COMMIT;
