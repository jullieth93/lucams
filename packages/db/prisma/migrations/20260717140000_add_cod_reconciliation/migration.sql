-- ADR-064 — Conciliación del efectivo contraentrega (COD). Solo las adiciones de CodReconciliation;
-- los DROP de drift que reporta `migrate diff` (índices trgm, rate_limit_buckets) se OMITEN a
-- propósito: viven en supabase/migrations/*.sql, no en el pipeline de Prisma.

-- CreateEnum
CREATE TYPE "CodReconciliationStatus" AS ENUM ('REMITTED', 'DISCREPANCY');

-- CreateTable
CREATE TABLE "CodReconciliation" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "status" "CodReconciliationStatus" NOT NULL,
    "expectedAmount" INTEGER NOT NULL,
    "remittedAmount" INTEGER,
    "remittedAt" TIMESTAMP(3),
    "remittedBy" TEXT,
    "carrierRef" TEXT,
    "discrepancyReason" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CodReconciliation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CodReconciliation_orderId_key" ON "CodReconciliation"("orderId");

-- CreateIndex
CREATE INDEX "CodReconciliation_status_updatedAt_idx" ON "CodReconciliation"("status", "updatedAt");

-- AddForeignKey
ALTER TABLE "CodReconciliation" ADD CONSTRAINT "CodReconciliation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
