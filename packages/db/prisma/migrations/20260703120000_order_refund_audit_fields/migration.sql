-- Bloque F2 — auditoría del reembolso desde admin.
-- Registra quién marcó la orden REFUNDED, cuándo, por qué y el monto reembolsado
-- (= total para reembolso completo). El movimiento de dinero en Wompi es manual.
ALTER TABLE "Order"
  ADD COLUMN "refundedAt" TIMESTAMP(3),
  ADD COLUMN "refundedBy" TEXT,
  ADD COLUMN "refundReason" TEXT,
  ADD COLUMN "refundAmount" INTEGER;
