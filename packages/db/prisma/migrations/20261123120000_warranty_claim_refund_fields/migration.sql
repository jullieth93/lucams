-- Additive migration: real cash refund tracking on WarrantyClaim (#6).
-- Allows Finanzas, CSV accounting export, Métricas, and Contact 360 LTV to deduct
-- confirmed warranty refunds without double-counting full Order.status = 'REFUNDED'.

ALTER TABLE "WarrantyClaim"
  ADD COLUMN "refundAmount" INTEGER,
  ADD COLUMN "refundMethod" TEXT,
  ADD COLUMN "refundedAt" TIMESTAMP(3);

ALTER TABLE "WarrantyClaim"
  ADD CONSTRAINT "WarrantyClaim_refundAmount_positive_check"
  CHECK ("refundAmount" IS NULL OR "refundAmount" > 0) NOT VALID;

ALTER TABLE "WarrantyClaim"
  VALIDATE CONSTRAINT "WarrantyClaim_refundAmount_positive_check";

ALTER TABLE "WarrantyClaim"
  ADD CONSTRAINT "WarrantyClaim_refundMethod_valid_check"
  CHECK ("refundMethod" IS NULL OR "refundMethod" IN ('WOMPI_VOID', 'BANK_TRANSFER')) NOT VALID;

ALTER TABLE "WarrantyClaim"
  VALIDATE CONSTRAINT "WarrantyClaim_refundMethod_valid_check";

CREATE INDEX "WarrantyClaim_status_resolutionType_refundedAt_idx"
  ON "WarrantyClaim"("status", "resolutionType", "refundedAt");

