-- P0-002 (Lucy 2026-06-26) — InventoryLog idempotency garantizada a nivel DB.
-- El helper stock.ts ya hace lookup previo en aplicación (capa 3 de idempotency),
-- pero un index parcial unique convierte la garantía en imposibilidad física
-- de duplicados, incluso bajo race condition extrema entre dos webhooks
-- Wompi APPROVED concurrentes.
--
-- Index PARCIAL (WHERE reason IN ...) porque ADMIN_ADJUSTMENT puede repetirse
-- legítimamente (admin ajusta stock varias veces para el mismo variant).

CREATE UNIQUE INDEX IF NOT EXISTS "InventoryLog_orderId_reason_unique"
  ON "InventoryLog" ("orderId", "reason")
  WHERE "reason" IN ('ORDER_PAID', 'ORDER_CANCELLED', 'ORDER_REFUNDED');
