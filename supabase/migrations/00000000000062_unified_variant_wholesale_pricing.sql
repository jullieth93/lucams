-- Espejo idempotente Supabase (ADR-209): WholesaleTier.variantId + OrderItem.designUnits + RLS/REVOKE.

ALTER TABLE public."WholesaleTier"
  ADD COLUMN IF NOT EXISTS "variantId" TEXT;

ALTER TABLE public."OrderItem"
  ADD COLUMN IF NOT EXISTS "designUnits" INTEGER NOT NULL DEFAULT 1;

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
  FROM public."OrderItem" AS oi
  JOIN public."ProductVariant" AS pv ON pv."id" = oi."variantId"
  JOIN public."Product" AS p ON p."id" = pv."productId"
  LEFT JOIN public."Design" AS d ON d."id" = oi."designId"
)
UPDATE public."OrderItem" AS oi
SET "designUnits" = c.design_units
FROM computed AS c
WHERE oi."id" = c."id";

UPDATE public."WholesaleTier"
SET "minQty" = 2
WHERE "minQty" < 2;

WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY COALESCE("productId", ''), COALESCE("variantId", ''), "minQty"
      ORDER BY "updatedAt" DESC, "createdAt" DESC, "id" DESC
    ) AS rn
  FROM public."WholesaleTier"
  WHERE "deletedAt" IS NULL
)
UPDATE public."WholesaleTier" AS w
SET "deletedAt" = NOW(), "isActive" = false
FROM ranked AS r
WHERE w."id" = r."id" AND r.rn > 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'WholesaleTier_variantId_fkey'
      AND conrelid = 'public."WholesaleTier"'::regclass
  ) THEN
    ALTER TABLE public."WholesaleTier"
      ADD CONSTRAINT "WholesaleTier_variantId_fkey"
      FOREIGN KEY ("variantId") REFERENCES public."ProductVariant"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'WholesaleTier_minQty_wholesale_check'
      AND conrelid = 'public."WholesaleTier"'::regclass
  ) THEN
    ALTER TABLE public."WholesaleTier"
      ADD CONSTRAINT "WholesaleTier_minQty_wholesale_check"
      CHECK ("minQty" >= 2) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'WholesaleTier_variant_requires_product_check'
      AND conrelid = 'public."WholesaleTier"'::regclass
  ) THEN
    ALTER TABLE public."WholesaleTier"
      ADD CONSTRAINT "WholesaleTier_variant_requires_product_check"
      CHECK ("variantId" IS NULL OR "productId" IS NOT NULL) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'OrderItem_designUnits_positive_check'
      AND conrelid = 'public."OrderItem"'::regclass
  ) THEN
    ALTER TABLE public."OrderItem"
      ADD CONSTRAINT "OrderItem_designUnits_positive_check"
      CHECK ("designUnits" >= 1) NOT VALID;
  END IF;
END
$$;

ALTER TABLE public."WholesaleTier" VALIDATE CONSTRAINT "WholesaleTier_minQty_wholesale_check";
ALTER TABLE public."WholesaleTier" VALIDATE CONSTRAINT "WholesaleTier_variant_requires_product_check";
ALTER TABLE public."OrderItem" VALIDATE CONSTRAINT "OrderItem_designUnits_positive_check";

CREATE INDEX IF NOT EXISTS "WholesaleTier_variantId_isActive_idx"
  ON public."WholesaleTier" ("variantId", "isActive");

CREATE UNIQUE INDEX IF NOT EXISTS "WholesaleTier_scope_minQty_active_key"
  ON public."WholesaleTier" (COALESCE("productId", ''), COALESCE("variantId", ''), "minQty")
  WHERE "deletedAt" IS NULL;

ALTER TABLE public."WholesaleTier" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."OrderItem" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public."WholesaleTier" FROM anon, authenticated;
REVOKE ALL ON TABLE public."OrderItem" FROM anon, authenticated;
REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE public."WholesaleTier" FROM service_role;
REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE public."OrderItem" FROM service_role;
