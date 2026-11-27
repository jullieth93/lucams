-- ADR-208 (Paso 1B): normaliza a 0 el stock legado (100_000) de variantes bajo pedido.
-- Los productos MADE_TO_ORDER gobiernan su disponibilidad por isActive e insumos en /admin/materiales,
-- nunca por ProductVariant.stock ni safetyStock.
UPDATE "ProductVariant" AS v
SET "stock" = 0,
    "safetyStock" = 0
FROM "Product" AS p
WHERE v."productId" = p."id"
  AND p."fulfillmentMode" = 'MADE_TO_ORDER'
  AND (v."stock" <> 0 OR v."safetyStock" <> 0);
