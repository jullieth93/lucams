-- P0-A (Lucy 2026-06-26) — CORRECCIÓN BLOQUEANTE detectada en certificación Bloque A.
--
-- El índice anterior InventoryLog_orderId_reason_unique estaba sobre (orderId, reason)
-- SIN variantId. Pero decrementStockForOrder crea UN InventoryLog por cada OrderItem,
-- todos con el mismo (orderId, reason=ORDER_PAID). Una orden de 2+ ítems → el 2º INSERT
-- violaba el unique → P2002 sin catch → rollback de la $transaction → Order atascada en
-- PENDING_PAYMENT a pesar de que Wompi YA cobró. Rompía la MAYORÍA de las ventas
-- (carrito multi-ítem es el caso normal). Reproducido empíricamente contra la DB.
--
-- Fix: el unique correcto es (orderId, reason, variantId): impide decrementar/revertir
-- el MISMO variant dos veces para el mismo order+reason (idempotencia real + backstop
-- de la carrera concurrente webhook+fallback), permitiendo múltiples variants por orden.
-- Sigue siendo PARCIAL (WHERE reason IN ...) porque ADMIN_ADJUSTMENT se repite legítimo.

DROP INDEX IF EXISTS "InventoryLog_orderId_reason_unique";

CREATE UNIQUE INDEX IF NOT EXISTS "InventoryLog_orderId_reason_variant_unique"
  ON "InventoryLog" ("orderId", "reason", "variantId")
  WHERE "reason" IN ('ORDER_PAID', 'ORDER_CANCELLED', 'ORDER_REFUNDED');
