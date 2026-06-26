-- Certificación Bloque A 2026-06-26 — dos fixes bloqueantes.

-- #6 — Pago cobrado sin stock visible. Columnas para marcar órdenes que
-- requieren intervención humana (Wompi cobró pero stock se agotó). Visible
-- en /admin/pedidos en vez de morir en un log (mandato #7 sin Sentry).
ALTER TABLE "Order" ADD COLUMN "needsReconciliation" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Order" ADD COLUMN "reconciliationReason" TEXT;
CREATE INDEX "Order_needsReconciliation_idx" ON "Order"("needsReconciliation");

-- #12 — Idempotencia de cartId garantizada a nivel DB. Antes era read-then-write
-- (findFirst + create) en READ COMMITTED sin constraint: dos finalizeCheckout
-- concurrentes del MISMO cart (doble-click / dos pestañas / reenvío POST) podían
-- crear 2 Orders PENDING_PAYMENT → 2 cobros Wompi. Este índice parcial unique lo
-- hace físicamente imposible: máximo 1 Order PENDING_PAYMENT activa por cart.
-- Parcial (status + deletedAt) porque tras CANCELLED el cliente puede reintentar
-- el mismo cart, y soft-deletes no deben bloquear.
CREATE UNIQUE INDEX "Order_cartId_pending_unique"
  ON "Order"("cartId")
  WHERE "status" = 'PENDING_PAYMENT' AND "deletedAt" IS NULL AND "cartId" IS NOT NULL;
