DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'FulfillmentMode') THEN
    CREATE TYPE public."FulfillmentMode" AS ENUM ('MADE_TO_ORDER', 'PHYSICAL_STOCK');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SalesChannel') THEN
    CREATE TYPE public."SalesChannel" AS ENUM ('STOREFRONT', 'MERCADOLIBRE', 'B2B', 'INTERNAL');
  END IF;
END
$$;

ALTER TABLE public."Product"
  ADD COLUMN IF NOT EXISTS "fulfillmentMode" public."FulfillmentMode" NOT NULL DEFAULT 'PHYSICAL_STOCK',
  ADD COLUMN IF NOT EXISTS "publishedOnStorefront" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public."ProductVariant"
  ADD COLUMN IF NOT EXISTS "safetyStock" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public."InventoryLog"
  ADD COLUMN IF NOT EXISTS "channel" public."SalesChannel" NOT NULL DEFAULT 'STOREFRONT',
  ADD COLUMN IF NOT EXISTS "channelOrderId" TEXT,
  ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;

UPDATE public."Product" AS p
SET "fulfillmentMode" = 'MADE_TO_ORDER'
WHERE p."personalizationKind" <> 'NONE'
   OR p."isPersonalizable" = true
   OR p."personalizationSchema"->>'letterSet' IN ('full', 'vowels')
   OR EXISTS (
     SELECT 1
     FROM public."ProductVariant" AS v
     WHERE v."productId" = p.id
       AND v."attributes"->>'variant' = 'name'
   );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ProductVariant_safetyStock_nonnegative_check'
      AND conrelid = 'public."ProductVariant"'::regclass
  ) THEN
    ALTER TABLE public."ProductVariant"
      ADD CONSTRAINT "ProductVariant_safetyStock_nonnegative_check"
      CHECK ("safetyStock" >= 0) NOT VALID;
  END IF;
END
$$;
ALTER TABLE public."ProductVariant"
  VALIDATE CONSTRAINT "ProductVariant_safetyStock_nonnegative_check";

CREATE UNIQUE INDEX IF NOT EXISTS "InventoryLog_idempotencyKey_key"
  ON public."InventoryLog" ("idempotencyKey");

ALTER TABLE public."Product" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ProductVariant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."InventoryLog" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public."Product" FROM anon, authenticated;
REVOKE ALL ON TABLE public."ProductVariant" FROM anon, authenticated;
REVOKE ALL ON TABLE public."InventoryLog" FROM anon, authenticated;
REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE public."Product" FROM service_role;
REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE public."ProductVariant" FROM service_role;
REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE public."InventoryLog" FROM service_role;
