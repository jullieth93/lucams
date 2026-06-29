-- Lucy 2026-06-27: "precio tachado" (promoción) por OPCIÓN, no por producto.
-- Antes Product.compareAtPrice se comparaba contra el precio de la opción y el
-- descuento podía salir negativo. Ahora vive en ProductVariant.

ALTER TABLE "ProductVariant" ADD COLUMN "compareAtPrice" INTEGER;

-- Backfill: copiar la promo del producto a cada opción activa SOLO donde sea un
-- "precio antes" válido (estrictamente mayor al precio efectivo de la opción
-- = price de la opción, o basePrice del producto si la opción no define price).
-- Así no se pierden las promos actuales y nunca queda un descuento negativo.
UPDATE "ProductVariant" v
SET "compareAtPrice" = p."compareAtPrice"
FROM "Product" p
WHERE v."productId" = p."id"
  AND v."deletedAt" IS NULL
  AND p."compareAtPrice" IS NOT NULL
  AND p."compareAtPrice" > COALESCE(v."price", p."basePrice");

-- Denormalizar Product.compareAtPrice = promo de la opción más barata, para que
-- las cards del storefront (que leen product.compareAtPrice) muestren el descuento
-- correcto. La app lo mantiene al día vía syncProductBasePrice tras editar opciones.
WITH cheapest AS (
  SELECT DISTINCT ON (v."productId")
    v."productId", v."price", v."compareAtPrice"
  FROM "ProductVariant" v
  WHERE v."deletedAt" IS NULL AND v."isActive" = true AND v."price" IS NOT NULL
  ORDER BY v."productId", v."price" ASC
)
UPDATE "Product" p
SET "compareAtPrice" = CASE
  WHEN c."compareAtPrice" IS NOT NULL AND c."compareAtPrice" > c."price" THEN c."compareAtPrice"
  ELSE NULL
END
FROM cheapest c
WHERE p."id" = c."productId";
