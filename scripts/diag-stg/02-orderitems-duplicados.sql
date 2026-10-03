-- Fase 0 · Diagnóstico ítems duplicados en email de compra (hallazgo 20)
-- Ejecutar contra la DB de STG. Reemplazar '<NUMERO>' por el número del pedido
-- donde se observó el desglose duplicado (ej. 'LCM-2026-0009' u otro).

-- 1) Ítems del pedido: ¿hay filas duplicadas del mismo producto/variante?
SELECT oi.id,
       oi."variantId",
       oi."designId",
       oi.qty,
       oi."unitPrice",
       p.name  AS product_name,
       v.name  AS variant_name
FROM "OrderItem" oi
JOIN "Order" o          ON o.id = oi."orderId"
JOIN "ProductVariant" v ON v.id = oi."variantId"
JOIN "Product" p        ON p.id = v."productId"
WHERE o.number = '<NUMERO>'
ORDER BY p.name, oi.id;

-- 2) Totales del pedido (para cruzar contra el cobro real en Wompi)
SELECT number, status, subtotal, "shippingCost", total, "customerId", "createdAt"
FROM "Order"
WHERE number = '<NUMERO>';

-- Qué buscar:
--  - Si hay 2+ filas con el mismo variantId pero designId DISTINTO, confirma la
--    hipótesis: merge de carritos (login en checkout o recuperación de carrito
--    abandonado) no deduplica por contenido (features/cart/service.ts:770-852).
--    El email mapea 1:1 order.items, así que el "desglose duplicado" es dato real.
--  - Verificar en el panel de Wompi que el cobro coincida con `total`:
--    si las líneas duplicadas inflaron el total, hay que gestionar reembolso.
