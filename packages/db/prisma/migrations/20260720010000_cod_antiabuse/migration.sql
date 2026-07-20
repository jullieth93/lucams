-- Anti-abuso contraentrega (COD), ADR-065: velocity por dirección + block-list persistente + no-show.
-- NOTA: SQL escrito a mano con SOLO estos cambios. `prisma migrate diff` incluía además DROPs de
-- objetos raw-SQL que NO están modelados en schema.prisma (índices pg_trgm de product, índices de
-- PersonalizationTemplate, tabla rate_limit_buckets) — drift tolerado; NO se dropean.

-- CreateEnum
CREATE TYPE "BlockedIdentityKind" AS ENUM ('PHONE', 'EMAIL', 'ADDRESS');

-- AlterTable: velocity por dirección (shippingAddressKey) + marca de no-show (admin)
ALTER TABLE "Order" ADD COLUMN     "noShowAt" TIMESTAMP(3),
ADD COLUMN     "noShowBy" TEXT,
ADD COLUMN     "shippingAddressKey" TEXT;

-- CreateTable
CREATE TABLE "BlockedIdentity" (
    "id" TEXT NOT NULL,
    "kind" "BlockedIdentityKind" NOT NULL,
    "value" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BlockedIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BlockedIdentity_kind_value_idx" ON "BlockedIdentity"("kind", "value");

-- CreateIndex
CREATE UNIQUE INDEX "BlockedIdentity_kind_value_key" ON "BlockedIdentity"("kind", "value");

-- CreateIndex
CREATE INDEX "Order_shippingAddressKey_idx" ON "Order"("shippingAddressKey");
