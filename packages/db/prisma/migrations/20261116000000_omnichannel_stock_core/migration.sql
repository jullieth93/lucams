CREATE TYPE "FulfillmentMode" AS ENUM ('MADE_TO_ORDER', 'PHYSICAL_STOCK');
CREATE TYPE "SalesChannel" AS ENUM ('STOREFRONT', 'MERCADOLIBRE', 'B2B', 'INTERNAL');

ALTER TABLE "Product"
  ADD COLUMN "fulfillmentMode" "FulfillmentMode" NOT NULL DEFAULT 'PHYSICAL_STOCK',
  ADD COLUMN "publishedOnStorefront" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "ProductVariant"
  ADD COLUMN "safetyStock" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "InventoryLog"
  ADD COLUMN "channel" "SalesChannel" NOT NULL DEFAULT 'STOREFRONT',
  ADD COLUMN "channelOrderId" TEXT,
  ADD COLUMN "idempotencyKey" TEXT;

UPDATE "Product" AS p
SET "fulfillmentMode" = 'MADE_TO_ORDER'
WHERE p."personalizationKind" <> 'NONE'
   OR p."isPersonalizable" = true
   OR p."personalizationSchema"->>'letterSet' IN ('full', 'vowels')
   OR EXISTS (
     SELECT 1
     FROM "ProductVariant" AS v
     WHERE v."productId" = p.id
       AND v."attributes"->>'variant' = 'name'
   );

ALTER TABLE "ProductVariant"
  ADD CONSTRAINT "ProductVariant_safetyStock_nonnegative_check"
  CHECK ("safetyStock" >= 0) NOT VALID;
ALTER TABLE "ProductVariant"
  VALIDATE CONSTRAINT "ProductVariant_safetyStock_nonnegative_check";

CREATE UNIQUE INDEX "InventoryLog_idempotencyKey_key"
  ON "InventoryLog" ("idempotencyKey");
