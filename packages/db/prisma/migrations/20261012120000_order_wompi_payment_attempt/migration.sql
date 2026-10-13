-- Referencia de pago Wompi única POR INTENTO (bug STG 2026-10: "El pago no pudo
-- ser realizado: Referencia: La referencia ya ha sido usada").
--
-- La reference enviada a Wompi era Order.number y la orden PENDING_PAYMENT se
-- REUSA por cartId (idempotencia de checkout): pasada la ventana de reintento de
-- Wompi (~3 min tras un DECLINED, doc oficial), cualquier reintento desde la
-- tienda chocaba con la referencia ya consumida. Ahora paymentAttempt cuenta los
-- checkouts generados y wompiReference guarda la referencia efectivamente
-- enviada (intento 1 = `LCM-YYYY-NNNN`; intento N ≥ 2 = `LCM-YYYY-NNNN-N`), con
-- wompiReferenceAt para la decisión de reuso dentro de la ventana. El webhook y
-- /checkout/gracias resuelven la orden por wompiReference exacta, por number o
-- extrayendo el número base del sufijo (features/orders/payment-reference.ts).
--
-- Backfill: toda orden WOMPI en PENDING_PAYMENT pre-existente ya tuvo un
-- checkout generado con la reference base (finalizeCheckout siempre lo crea), así
-- que esa referencia puede estar consumida en Wompi aunque no haya txId
-- persistido (un DECLINED de tarjeta no deja wompiTransactionId). Se marcan con
-- paymentAttempt = 1 para que su próximo reintento rote a `${number}-2` en vez
-- de reusar la base.
--
-- Aditiva y reversible (DROP COLUMN / DROP INDEX). Escrita a mano y aplicada con
-- `migrate deploy` — `migrate dev` no funciona contra esta DB (shadow DB en
-- Supabase, convención del repo).

ALTER TABLE "Order" ADD COLUMN "paymentAttempt" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN "wompiReference" TEXT;
ALTER TABLE "Order" ADD COLUMN "wompiReferenceAt" TIMESTAMP(3);

CREATE INDEX "Order_wompiReference_idx" ON "Order"("wompiReference");

UPDATE "Order"
SET "paymentAttempt" = 1
WHERE status = 'PENDING_PAYMENT'
  AND "paymentMethod" = 'WOMPI'
  AND "deletedAt" IS NULL;
