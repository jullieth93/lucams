-- Migración aditiva: snapshots de contacto en Opportunity + diagnóstico e historial de ítems en AbandonedCart.
-- Cumple F-24 (CHECK >= 0 en columnas monetarias y dominios discretos) y preserva RLS/REVOKE existentes.

-- 1. Columnas snapshot en Opportunity
ALTER TABLE "Opportunity"
  ADD COLUMN IF NOT EXISTS "contactName" TEXT,
  ADD COLUMN IF NOT EXISTS "contactEmail" TEXT,
  ADD COLUMN IF NOT EXISTS "contactWhatsapp" TEXT;

-- Backfill seguro de oportunidades existentes desde Contact / ContactIdentity(WHATSAPP)
UPDATE "Opportunity" o
SET
  "contactName" = COALESCE(o."contactName", c."displayName"),
  "contactEmail" = COALESCE(o."contactEmail", c."primaryEmail"),
  "contactWhatsapp" = COALESCE(
    o."contactWhatsapp",
    (
      SELECT ci."normalizedValue"
      FROM "ContactIdentity" ci
      WHERE ci."contactId" = o."contactId"
        AND ci."type" = 'WHATSAPP'
      ORDER BY ci."createdAt" DESC
      LIMIT 1
    ),
    c."primaryPhoneE164"
  )
FROM "Contact" c
WHERE c."id" = o."contactId"
  AND (
    o."contactName" IS NULL
    OR o."contactEmail" IS NULL
    OR o."contactWhatsapp" IS NULL
  );

-- 2. Columnas diagnósticas y snapshot de ítems en AbandonedCart
ALTER TABLE "AbandonedCart"
  ADD COLUMN IF NOT EXISTS "recoveredOrderId" TEXT,
  ADD COLUMN IF NOT EXISTS "itemsSnapshot" JSONB,
  ADD COLUMN IF NOT EXISTS "subtotalCents" INTEGER,
  ADD COLUMN IF NOT EXISTS "checkoutStep" TEXT,
  ADD COLUMN IF NOT EXISTS "closedReason" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AbandonedCart_recoveredOrderId_fkey'
  ) THEN
    ALTER TABLE "AbandonedCart"
      ADD CONSTRAINT "AbandonedCart_recoveredOrderId_fkey"
      FOREIGN KEY ("recoveredOrderId") REFERENCES "Order"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AbandonedCart_subtotalCents_nonneg_chk'
  ) THEN
    ALTER TABLE "AbandonedCart"
      ADD CONSTRAINT "AbandonedCart_subtotalCents_nonneg_chk"
      CHECK ("subtotalCents" IS NULL OR "subtotalCents" >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AbandonedCart_checkoutStep_chk'
  ) THEN
    ALTER TABLE "AbandonedCart"
      ADD CONSTRAINT "AbandonedCart_checkoutStep_chk"
      CHECK ("checkoutStep" IS NULL OR "checkoutStep" IN ('DATOS', 'ENVIO', 'PAGO'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AbandonedCart_closedReason_chk'
  ) THEN
    ALTER TABLE "AbandonedCart"
      ADD CONSTRAINT "AbandonedCart_closedReason_chk"
      CHECK ("closedReason" IS NULL OR "closedReason" IN ('ORDER_PAID', 'QUOTE_CREATED', 'CART_EMPTIED'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "AbandonedCart_closedReason_recoveredAt_idx"
  ON "AbandonedCart"("closedReason", "recoveredAt");

CREATE INDEX IF NOT EXISTS "AbandonedCart_recoveredOrderId_idx"
  ON "AbandonedCart"("recoveredOrderId");

-- 3. Reconciliación histórica de AbandonedCart contra Order / Cart / CartItem
UPDATE "AbandonedCart" ac
SET
  "recoveredOrderId" = COALESCE(ac."recoveredOrderId", paid_ord."id"),
  "recoveredAt" = COALESCE(ac."recoveredAt", paid_ord."updatedAt", now()),
  "closedReason" = 'ORDER_PAID',
  "checkoutStep" = COALESCE(ac."checkoutStep", 'PAGO')
FROM (
  SELECT DISTINCT ON (o."cartId")
    o."cartId",
    o."id",
    o."updatedAt"
  FROM "Order" o
  WHERE o."cartId" IS NOT NULL
    AND o."deletedAt" IS NULL
    AND o."status" IN ('PAID', 'FULFILLING', 'SHIPPED', 'DELIVERED', 'REFUNDED')
  ORDER BY o."cartId", o."createdAt" DESC
) paid_ord
WHERE paid_ord."cartId" = ac."cartId"
  AND (ac."closedReason" IS NULL OR ac."recoveredAt" IS NULL OR ac."recoveredOrderId" IS NULL);

UPDATE "AbandonedCart" ac
SET
  "closedReason" = 'QUOTE_CREATED',
  "checkoutStep" = COALESCE(ac."checkoutStep", 'DATOS')
FROM "Cart" ca
WHERE ca."id" = ac."cartId"
  AND ac."closedReason" IS NULL
  AND ac."recoveredAt" IS NULL
  AND ca."deletedBy" = 'quote:create';

UPDATE "AbandonedCart" ac
SET
  "closedReason" = 'CART_EMPTIED',
  "checkoutStep" = COALESCE(ac."checkoutStep", 'DATOS')
FROM "Cart" ca
WHERE ca."id" = ac."cartId"
  AND ac."closedReason" IS NULL
  AND ac."recoveredAt" IS NULL
  AND ca."deletedAt" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "CartItem" ci WHERE ci."cartId" = ca."id"
  );

UPDATE "AbandonedCart" ac
SET "checkoutStep" = CASE
  WHEN EXISTS (
    SELECT 1 FROM "Order" o
    WHERE o."cartId" = ac."cartId" AND o."deletedAt" IS NULL
  ) THEN 'PAGO'
  ELSE 'DATOS'
END
WHERE ac."checkoutStep" IS NULL;

UPDATE "AbandonedCart" ac
SET
  "subtotalCents" = snap."subtotalCents",
  "itemsSnapshot" = snap."itemsJson"
FROM (
  SELECT
    ci."cartId",
    COALESCE(SUM(ci."unitPrice" * ci."qty"), 0)::integer AS "subtotalCents",
    jsonb_agg(
      jsonb_build_object(
        'productId', p."id",
        'productName', p."name",
        'productSlug', p."slug",
        'variantId', pv."id",
        'variantName', pv."name",
        'sku', pv."sku",
        'qty', ci."qty",
        'unitPriceCents', ci."unitPrice",
        'lineTotalCents', (ci."unitPrice" * ci."qty"),
        'designId', d."id",
        'designPreviewUrl', d."previewUrl"
      )
      ORDER BY ci."createdAt" ASC
    ) AS "itemsJson"
  FROM "CartItem" ci
  JOIN "ProductVariant" pv ON pv."id" = ci."variantId"
  JOIN "Product" p ON p."id" = pv."productId"
  LEFT JOIN "Design" d ON d."id" = ci."designId"
  GROUP BY ci."cartId"
) snap
WHERE snap."cartId" = ac."cartId"
  AND ac."itemsSnapshot" IS NULL;
