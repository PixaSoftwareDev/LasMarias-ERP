-- Corrección de datos puntual (oct 2026) — acompaña el deploy de reproceso / crema / lotes.
-- Arregla lo que se cargó mal en producción el 20-21/10/2026 por falta de esas funciones,
-- para no pedírselo al dueño. Se corre UNA vez, con backup previo:
--
--   docker exec -i lasmarias-postgres psql -U lasmarias -d lasmarias -v ON_ERROR_STOP=1 < fix-datos-2026-10.sql
--
-- Todo va en una transacción e IDEMPOTENTE: cada paso mira si ya se hizo antes de tocar nada.
-- No borra stock ni cambia saldos de clientes (las ventas que se pasan a consumo eran de $0).

BEGIN;

-- 1) Crema cruda: costo de referencia. El lote se cargó a mano sin costo; el dueño ya había
--    puesto $4.165/kg en el insumo de reemplazo "CREMA DE LECHE PARA PASTEURIZAR". Se copia
--    ese valor a la crema cruda, que ahora es el ORIGEN de la orden de crema pasteurizada.
UPDATE products c
SET default_cost = i.default_cost,
    default_cost_currency = i.default_cost_currency,
    cost_iva_mode = i.cost_iva_mode,
    updated_at = now()
FROM products i
WHERE c.sku = 'CLNP' AND i.sku = 'CREMA INSUMO'
  AND c.default_cost IS NULL AND i.default_cost IS NOT NULL;

-- 2) Receta CREMA DE LECHE: nueva versión SIN el insumo de reemplazo. Con la crema cruda como
--    origen, dejarlo cobraría la crema dos veces. Las versiones viejas quedan como estaban
--    (versionado: ninguna orden cambia de costo). El insumo de reemplazo se da de baja.
WITH activa AS (
  SELECT v.*
  FROM recipe_versions v
  JOIN recipes r ON r.id = v.recipe_id
  WHERE r.name = 'CREMA DE LECHE' AND v.is_active
    AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(v.ingredients) e
      WHERE e->>'productId' = (SELECT id::text FROM products WHERE sku = 'CREMA INSUMO')
    )
), nueva AS (
  INSERT INTO recipe_versions (
    recipe_id, version_number, base_yield_kg_per_liter, yield_sensitivity_fat, yield_sensitivity_protein,
    baseline_fat_percent, baseline_protein_percent, standard_waste_percent, ingredients, byproducts, is_active, notes
  )
  SELECT recipe_id,
         (SELECT max(version_number) + 1 FROM recipe_versions x WHERE x.recipe_id = activa.recipe_id),
         base_yield_kg_per_liter, yield_sensitivity_fat, yield_sensitivity_protein,
         baseline_fat_percent, baseline_protein_percent, standard_waste_percent,
         (SELECT coalesce(jsonb_agg(e), '[]'::jsonb) FROM jsonb_array_elements(activa.ingredients) e
           WHERE e->>'productId' <> (SELECT id::text FROM products WHERE sku = 'CREMA INSUMO')),
         byproducts, true,
         'Sin el insumo CREMA DE LECHE PARA PASTEURIZAR: la crema cruda ahora se elige como origen de la orden '
           || '(con su costo de $/kg). Dejarlo cobraba la crema dos veces.'
  FROM activa
  RETURNING recipe_id
)
UPDATE recipe_versions v SET is_active = false, updated_at = now()
FROM activa
WHERE v.id = activa.id;

UPDATE products SET is_active = false, updated_at = now()
WHERE sku = 'CREMA INSUMO' AND is_active
  AND NOT EXISTS (  -- solo si ninguna receta ACTIVA lo sigue usando
    SELECT 1 FROM recipe_versions v, jsonb_array_elements(v.ingredients) e
    WHERE v.is_active AND e->>'productId' = products.id::text
  );

-- 3) CUIT de relleno (00000000000 / 00-00000000-0): el formulario no dejaba cargar un cliente
--    sin CUIT y por eso se tipearon ceros. Ahora vacío = sin CUIT.
UPDATE clients SET tax_id = NULL, updated_at = now()
WHERE tax_id IS NOT NULL AND regexp_replace(tax_id, '\D', '', 'g') ~ '^0+$';

-- 4) "Ventas" a $0 a VARIOS que en realidad fueron masa usada para hacer mozzarella
--    (DSP-000084: 44.552,3 kg del período de prueba; DSP-000085: 414,7 kg del 20/10). Se pasan
--    a CONSUMO de stock: el stock queda exactamente igual (mismos lotes, mismos kg), pero dejan
--    de contar como ventas en reportes y rentabilidad. Solo si siguen a $0 y sin devoluciones.
CREATE TEMP TABLE ventas_a_consumo ON COMMIT DROP AS
SELECT s.id, s.code
FROM sales_orders s
JOIN clients c ON c.id = s.client_id
WHERE s.code IN ('DSP-000084', 'DSP-000085')
  AND s.total = 0
  AND c.business_name = 'VARIOS'
  AND NOT EXISTS (SELECT 1 FROM credit_notes n WHERE n.sales_order_id = s.id);

UPDATE inventory_movements m
SET reason = 'consumption',
    reference_type = 'stock_adjustment',
    reference_id = NULL,
    notes = 'Consumo: masa usada para elaborar mozzarella (antes cargada como venta ' || v.code || ' a $0)'
FROM ventas_a_consumo v
WHERE m.reference_type = 'sales_order' AND m.reference_id = v.id AND m.reason = 'sale';

DELETE FROM account_movements a
USING ventas_a_consumo v
WHERE a.reference_type = 'sales_order' AND a.reference_id = v.id AND a.amount = 0;

DELETE FROM sales_orders s USING ventas_a_consumo v WHERE s.id = v.id;

-- Resumen de lo que quedó (para el log del deploy).
SELECT 'crema cruda $/kg' AS que, default_cost::text AS valor FROM products WHERE sku = 'CLNP'
UNION ALL
SELECT 'receta crema activa', 'v' || v.version_number || ' · ' || jsonb_array_length(v.ingredients) || ' insumos'
  FROM recipe_versions v JOIN recipes r ON r.id = v.recipe_id WHERE r.name = 'CREMA DE LECHE' AND v.is_active
UNION ALL
SELECT 'clientes con CUIT de ceros', count(*)::text FROM clients WHERE regexp_replace(coalesce(tax_id, '1'), '\D', '', 'g') ~ '^0+$'
UNION ALL
SELECT 'ventas a $0 de VARIOS', count(*)::text FROM sales_orders s JOIN clients c ON c.id = s.client_id
  WHERE c.business_name = 'VARIOS' AND s.total = 0;

COMMIT;
