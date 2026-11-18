-- ADR-209: Escalas mayoristas opcionales por variante física (WholesaleTier.variantId)
-- y sellado inmutable de unidades por tanda en OrderItem.designUnits.

ALTER TABLE "WholesaleTier"
  ADD COLUMN "variantId" TEXT;

ALTER TABLE "OrderItem"
  ADD COLUMN "designUnits" INTEGER NOT NULL DEFAULT 1;

-- Backfill seguro de OrderItem.designUnits para pedidos existentes (canvas V2 + sets de letras).
WITH computed AS (
  SELECT
    oi."id",
    GREATEST(
      1,
      (
        CASE
          WHEN oi."customDesign" IS NOT NULL
            AND jsonb_typeof(oi."customDesign") = 'object'
            AND oi."customDesign"->>'version' = '2'
            AND (oi."customDesign"->>'unitSlots') ~ '^[1-9][0-9]*$'
            AND (oi."customDesign"->>'slotCount') ~ '^[1-9][0-9]*$'
          THEN GREATEST(
            1,
            CEIL(
              ((oi."customDesign"->>'slotCount')::numeric) /
              GREATEST(
                1,
                CASE
                  WHEN (oi."customDesign"->>'photoSlots') ~ '^[1-9][0-9]*$'
                  THEN ((oi."customDesign"->>'photoSlots')::int) *
                       GREATEST(
                         1,
                         CASE
                           WHEN (p."personalizationSchema"->>'facesPerUnit') ~ '^[1-9][0-9]*$'
                           THEN (p."personalizationSchema"->>'facesPerUnit')::int
                           ELSE 1
                         END
                       )
                  ELSE (oi."customDesign"->>'unitSlots')::int
                END
              )::numeric
            )::int
          )
          ELSE 1
        END
      ) * (
        CASE
          WHEN d."metadata" IS NOT NULL
            AND jsonb_typeof(d."metadata") = 'object'
            AND d."metadata"->>'surface' = 'letterset'
            AND (d."metadata"->>'unitCount') ~ '^[1-9][0-9]*$'
          THEN LEAST(10, GREATEST(1, (d."metadata"->>'unitCount')::int))
          ELSE 1
        END
      )
    ) AS design_units
  FROM "OrderItem" AS oi
  JOIN "ProductVariant" AS pv ON pv."id" = oi."variantId"
  JOIN "Product" AS p ON p."id" = pv."productId"
  LEFT JOIN "Design" AS d ON d."id" = oi."designId"
)
UPDATE "OrderItem" AS oi
SET "designUnits" = c.design_units
FROM computed AS c
WHERE oi."id" = c."id";

-- Saneamiento defensivo previo a restricciones e índice único parcial.
UPDATE "WholesaleTier"
SET "minQty" = 2
WHERE "minQty" < 2;

WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY COALESCE("productId", ''), COALESCE("variantId", ''), "minQty"
      ORDER BY "updatedAt" DESC, "createdAt" DESC, "id" DESC
    ) AS rn
  FROM "WholesaleTier"
  WHERE "deletedAt" IS NULL
)
UPDATE "WholesaleTier" AS w
SET "deletedAt" = NOW(), "isActive" = false
FROM ranked AS r
WHERE w."id" = r."id" AND r.rn > 1;

ALTER TABLE "WholesaleTier"
  ADD CONSTRAINT "WholesaleTier_variantId_fkey"
  FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "WholesaleTier_variantId_isActive_idx"
  ON "WholesaleTier" ("variantId", "isActive");

CREATE UNIQUE INDEX "WholesaleTier_scope_minQty_active_key"
  ON "WholesaleTier" (COALESCE("productId", ''), COALESCE("variantId", ''), "minQty")
  WHERE "deletedAt" IS NULL;

ALTER TABLE "WholesaleTier"
  ADD CONSTRAINT "WholesaleTier_minQty_wholesale_check"
  CHECK ("minQty" >= 2) NOT VALID;
ALTER TABLE "WholesaleTier"
  VALIDATE CONSTRAINT "WholesaleTier_minQty_wholesale_check";

ALTER TABLE "WholesaleTier"
  ADD CONSTRAINT "WholesaleTier_variant_requires_product_check"
  CHECK ("variantId" IS NULL OR "productId" IS NOT NULL) NOT VALID;
ALTER TABLE "WholesaleTier"
  VALIDATE CONSTRAINT "WholesaleTier_variant_requires_product_check";

ALTER TABLE "OrderItem"
  ADD CONSTRAINT "OrderItem_designUnits_positive_check"
  CHECK ("designUnits" >= 1) NOT VALID;
ALTER TABLE "OrderItem"
  VALIDATE CONSTRAINT "OrderItem_designUnits_positive_check";
