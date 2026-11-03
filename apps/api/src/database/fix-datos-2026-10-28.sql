-- Familia de producto para el subtotal en Stock (pedido del dueño, audio 27/10/2026):
-- todas las mozzarellas (marcas, planchas y cilindros) suman en "Mozzarella en total".
-- Idempotente. Correr en prod después del deploy que agrega la columna products.family.
BEGIN;
UPDATE products SET family = 'Mozzarella' WHERE family IS NULL AND name ILIKE 'QUESO MOZZARELLA%';
SELECT sku, name, family FROM products WHERE category = 'queso' ORDER BY name;
COMMIT;
