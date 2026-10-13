-- Programa "Puntos Lucams" (2026-10-12) — primera escritura real del ledger
-- LoyaltyTxn (existía desde el init pero NUNCA se escribía) y redención de
-- puntos como descuento en el checkout.
--
--   - Order.loyaltyPointsRedeemed: puntos consumidos por esta orden. Se
--     RESERVAN al crear/reconciliar la PENDING_PAYMENT (salen del balance de
--     inmediato, igual que el descuento queda fijo en el total cobrado) y se
--     RESTAURAN si la orden se CANCELA o REEMBOLSA (simétrico a la liberación
--     de cupón de transitionOrder, F2).
--   - Order.loyaltyDiscount: equivalencia en centavos COP ya descontada del
--     total (total = subtotal + shipping - discount - loyaltyDiscount + tax).
--     Va en columna propia para no conflarla con el descuento de cupón
--     (reportes, conciliación COD y emails la distinguen).
--   - Índice único parcial LoyaltyTxn(orderId, reason) WHERE orderId IS NOT
--     NULL: idempotencia del earn de la saga (un retry del webhook no duplica
--     puntos — P2002 = ya acreditado) y una sola fila REDEEM por orden.
--
-- Los CHECK `>= 0` siguen la convención F-24 (20260904144657): NOT VALID +
-- VALIDATE back to back (sin table scan bloqueante; enforced para escrituras
-- nuevas desde el ADD). Prisma no expresa CHECK ni índices parciales — ambos
-- quedan documentados inline en schema.prisma (mismo patrón SQL-only que el
-- índice parcial de InventoryLog); NO regenerar un diff que los dropee.
--
-- Aditiva y reversible (DROP COLUMN / DROP INDEX / DROP CONSTRAINT). Escrita a
-- mano y aplicada con `migrate deploy` — `migrate dev` no funciona contra esta
-- DB (shadow DB en Supabase, convención del repo).

ALTER TABLE "Order" ADD COLUMN "loyaltyDiscount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN "loyaltyPointsRedeemed" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Order" ADD CONSTRAINT "Order_loyaltyDiscount_nonnegative_check" CHECK ("loyaltyDiscount" >= 0) NOT VALID;
ALTER TABLE "Order" VALIDATE CONSTRAINT "Order_loyaltyDiscount_nonnegative_check";
ALTER TABLE "Order" ADD CONSTRAINT "Order_loyaltyPointsRedeemed_nonnegative_check" CHECK ("loyaltyPointsRedeemed" >= 0) NOT VALID;
ALTER TABLE "Order" VALIDATE CONSTRAINT "Order_loyaltyPointsRedeemed_nonnegative_check";

CREATE UNIQUE INDEX "LoyaltyTxn_orderId_reason_key" ON "LoyaltyTxn"("orderId", "reason") WHERE "orderId" IS NOT NULL;
