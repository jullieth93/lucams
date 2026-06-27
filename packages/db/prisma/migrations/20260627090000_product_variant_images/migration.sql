-- D1 (Lucy 2026-06-27): fotos propias por opción (ProductVariant).
-- Vacío = hereda Product.images (espeja la herencia de `price`).
ALTER TABLE "ProductVariant"
  ADD COLUMN "images" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
