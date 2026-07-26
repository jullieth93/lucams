-- Ola Admin 100% (Lucy 2026-07-26) — módulos Mayorista B2B y Materiales.
-- Solo CREATE (sin drops): las tablas nuevas WholesaleTier y Material.

CREATE TABLE "WholesaleTier" (
    "id" TEXT NOT NULL,
    "productId" TEXT,
    "minQty" INTEGER NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "note" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,
    CONSTRAINT "WholesaleTier_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Material" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "stock" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "minStock" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "costPerUnit" INTEGER,
    "note" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,
    CONSTRAINT "Material_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WholesaleTier_productId_isActive_idx" ON "WholesaleTier"("productId", "isActive");
CREATE INDEX "WholesaleTier_deletedAt_idx" ON "WholesaleTier"("deletedAt");
CREATE INDEX "Material_isActive_idx" ON "Material"("isActive");
CREATE INDEX "Material_deletedAt_idx" ON "Material"("deletedAt");

ALTER TABLE "WholesaleTier" ADD CONSTRAINT "WholesaleTier_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
