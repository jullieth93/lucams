-- Garantía configurable por producto, con término inmutable por compra.
--
-- Product.warrantyMonths deja de tener la política uniforme de 3 meses: su
-- default para productos nuevos pasa a 1 y el Admin puede elegir 1..120. La
-- garantía aceptada por cada cliente, sin embargo, NO puede depender de un
-- cambio posterior de catálogo. Por eso cada OrderItem recibe un snapshot.
--
-- Backfill: antes de cambiar el catálogo, las órdenes históricas copian el
-- término que la aplicación les reconocía al desplegar esta migración. Así
-- ningún pedido existente pierde derechos, aunque su producto se cambie luego.
--
-- Esta migración no modifica Product.warrantyMonths existentes: el one-shot
-- publish-legal-v2-20261102.mjs publica la nueva política y cambia el catálogo
-- en la misma operación controlada de CMS, después del deploy en cada ambiente.

ALTER TABLE "OrderItem" ADD COLUMN "warrantyMonths" INTEGER;

UPDATE "OrderItem" AS item
SET "warrantyMonths" = product."warrantyMonths"
FROM "ProductVariant" AS variant
JOIN "Product" AS product ON product.id = variant."productId"
WHERE item."variantId" = variant.id;

ALTER TABLE "OrderItem" ALTER COLUMN "warrantyMonths" SET DEFAULT 1;
ALTER TABLE "OrderItem" ALTER COLUMN "warrantyMonths" SET NOT NULL;
ALTER TABLE "Product" ALTER COLUMN "warrantyMonths" SET DEFAULT 1;

-- Prisma no expresa CHECK. NOT VALID protege nuevas escrituras de inmediato y
-- VALIDATE confirma la integridad histórica con el perfil de bloqueo estándar.
ALTER TABLE "Product"
  ADD CONSTRAINT "Product_warrantyMonths_range_check"
  CHECK ("warrantyMonths" BETWEEN 1 AND 120) NOT VALID;
ALTER TABLE "Product" VALIDATE CONSTRAINT "Product_warrantyMonths_range_check";

ALTER TABLE "OrderItem"
  ADD CONSTRAINT "OrderItem_warrantyMonths_range_check"
  CHECK ("warrantyMonths" BETWEEN 1 AND 120) NOT VALID;
ALTER TABLE "OrderItem" VALIDATE CONSTRAINT "OrderItem_warrantyMonths_range_check";
