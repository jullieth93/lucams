-- Bloque F3 — solicitud de retracto (Ley 1480 art. 47 + Ley 2439/2024).
-- Solo objetos de RetractRequest: los DROP que sugería `migrate diff` (índices
-- trgm, rate_limit_buckets) son tablas/índices NO-Prisma creados vía
-- supabase/migrations/*.sql y NO deben tocarse.

-- CreateEnum
CREATE TYPE "RetractStatus" AS ENUM ('PENDING', 'APPROVED', 'RECEIVED', 'REFUNDED', 'REJECTED');

-- CreateTable
CREATE TABLE "RetractRequest" (
    "id" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "status" "RetractStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "rejectionNote" TEXT,
    "refundAmount" INTEGER NOT NULL,
    "refundMethod" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "processedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetractRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RetractRequest_orderItemId_key" ON "RetractRequest"("orderItemId");

-- CreateIndex
CREATE INDEX "RetractRequest_status_requestedAt_idx" ON "RetractRequest"("status", "requestedAt");

-- AddForeignKey
ALTER TABLE "RetractRequest" ADD CONSTRAINT "RetractRequest_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
