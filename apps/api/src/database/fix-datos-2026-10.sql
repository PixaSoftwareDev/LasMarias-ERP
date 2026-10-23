-- Corrección de datos puntual (oct 2026) — acompaña el deploy de reproceso / crema / lotes.
-- Arregla lo que se cargó mal en producción el 20-21/10/2026 por falta de esas funciones,
-- para no pedírselo al dueño. Se corre UNA vez, con backup previo:
--
--   docker exec -i lasmarias-postgres psql -U lasmarias -d lasmarias -v ON_ERROR_STOP=1 < fix-datos-2026-10.sql
--
-- Todo va en una transacción e IDEMPOTENTE: cada paso mira si ya se hizo antes de tocar nada.
-- No borra ni modifica nada de lo que cargó el dueño: solo completa un costo vacío y agrega
-- una versión de receta.

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
--    (versionado: ninguna orden cambia de costo). El insumo de reemplazo queda como está.
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

-- Resumen de lo que quedó (para el log del deploy).
SELECT 'crema cruda $/kg' AS que, default_cost::text AS valor FROM products WHERE sku = 'CLNP'
UNION ALL
SELECT 'receta crema activa', 'v' || v.version_number || ' · ' || jsonb_array_length(v.ingredients) || ' insumos'
  FROM recipe_versions v JOIN recipes r ON r.id = v.recipe_id WHERE r.name = 'CREMA DE LECHE' AND v.is_active;

COMMIT;
