-- Garantías (Ley 1480 art. 7-15). Solo las adiciones de WarrantyClaim; los DROP de drift que
-- reporta `migrate diff` (índices trgm, rate_limit_buckets) se OMITEN a propósito: viven en
-- supabase/migrations/*.sql, no en el pipeline de Prisma.

-- CreateEnum
CREATE TYPE "WarrantyStatus" AS ENUM ('PENDING', 'IN_REVIEW', 'APPROVED', 'RESOLVED', 'REJECTED');

-- CreateTable
CREATE TABLE "WarrantyClaim" (
    "id" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "customerId" TEXT,
    "status" "WarrantyStatus" NOT NULL DEFAULT 'PENDING',
    "description" TEXT NOT NULL,
    "evidenceUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "resolutionType" TEXT,
    "resolutionNote" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "processedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WarrantyClaim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WarrantyClaim_status_requestedAt_idx" ON "WarrantyClaim"("status", "requestedAt");

-- CreateIndex
CREATE INDEX "WarrantyClaim_orderItemId_idx" ON "WarrantyClaim"("orderItemId");

-- CreateIndex
CREATE INDEX "WarrantyClaim_customerId_idx" ON "WarrantyClaim"("customerId");

-- AddForeignKey
ALTER TABLE "WarrantyClaim" ADD CONSTRAINT "WarrantyClaim_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarrantyClaim" ADD CONSTRAINT "WarrantyClaim_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
