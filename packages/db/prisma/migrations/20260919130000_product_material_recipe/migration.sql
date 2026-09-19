-- Fase 7b — costeo por materiales: tabla ProductMaterial (receta por producto).
-- Solo CREATE (sin drops). quantity es DOUBLE PRECISION como Material.stock
-- (unidades fraccionadas: metros, ml…) y lleva CHECK > 0 (patrón F-24: Prisma
-- no expresa CHECK, se agrega SQL-only acá).
-- FK producto: ON DELETE CASCADE (la receta muere con el producto).
-- FK material: ON DELETE RESTRICT (Material usa soft delete; no se borra en
-- cascada ni se permite borrar un insumo que sigue en una receta).

CREATE TABLE "ProductMaterial" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    CONSTRAINT "ProductMaterial_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductMaterial_productId_materialId_key" ON "ProductMaterial"("productId", "materialId");
CREATE INDEX "ProductMaterial_materialId_idx" ON "ProductMaterial"("materialId");

ALTER TABLE "ProductMaterial" ADD CONSTRAINT "ProductMaterial_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductMaterial" ADD CONSTRAINT "ProductMaterial_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProductMaterial" ADD CONSTRAINT "ProductMaterial_quantity_positive" CHECK ("quantity" > 0);
