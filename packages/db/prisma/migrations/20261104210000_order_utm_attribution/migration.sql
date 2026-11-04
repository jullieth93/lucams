-- S25 (Fase 12): Atribución first-party sin PII sobre `Order` para cálculo real de LTV por canal.
-- Columnas anulables aditivas: cero bloqueo y 100 % retrocompatible con órdenes existentes.

ALTER TABLE "public"."Order"
  ADD COLUMN IF NOT EXISTS "utmSource" TEXT,
  ADD COLUMN IF NOT EXISTS "utmMedium" TEXT,
  ADD COLUMN IF NOT EXISTS "utmCampaign" TEXT,
  ADD COLUMN IF NOT EXISTS "landingPath" TEXT;

CREATE INDEX IF NOT EXISTS "Order_utmSource_status_createdAt_idx"
  ON "public"."Order"("utmSource", "status", "createdAt");
