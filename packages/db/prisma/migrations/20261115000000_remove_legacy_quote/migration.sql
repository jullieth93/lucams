-- Retiro definitivo de la POC de cotizaciones individuales por WhatsApp.
-- PRD fue verificado previamente con 0 filas y 0 referencias. La guarda evita
-- borrar información si otro ambiente hubiera vuelto a usar el flujo por error.
DO $$
BEGIN
  IF (SELECT count(*) FROM "Quote") > 0 THEN
    RAISE EXCEPTION 'No se puede retirar Quote: existen % cotizaciones por revisar', (SELECT count(*) FROM "Quote");
  END IF;
END $$;

-- Normaliza marcas de la POC en entornos de prueba antes de contraer el CHECK.
UPDATE "AbandonedCart" SET "closedReason" = 'CART_EMPTIED' WHERE "closedReason" = 'QUOTE_CREATED';
UPDATE "Cart" SET "deletedBy" = NULL WHERE "deletedBy" = 'quote:create';
UPDATE "Contact" SET "source" = 'MANUAL' WHERE "source" = 'QUOTE';
DELETE FROM "Notification" WHERE "type" = 'QUOTE';
DELETE FROM "EmailTemplateOverride" WHERE "templateId" = 'quote-admin-notification';
DELETE FROM "CmsField" WHERE "key" = 'WA_MSG_QUOTE';

ALTER TABLE "AbandonedCart" DROP CONSTRAINT IF EXISTS "AbandonedCart_closedReason_chk";
ALTER TABLE "AbandonedCart"
  ADD CONSTRAINT "AbandonedCart_closedReason_chk"
  CHECK ("closedReason" IS NULL OR "closedReason" IN ('ORDER_PAID', 'CART_EMPTIED'));

ALTER TABLE "Opportunity" DROP CONSTRAINT IF EXISTS "Opportunity_convertedQuoteId_fkey";
ALTER TABLE "Opportunity" DROP COLUMN IF EXISTS "convertedQuoteId";

DROP TABLE IF EXISTS "QuoteItem";
DROP TABLE IF EXISTS "Quote";
DROP TYPE IF EXISTS "QuoteStatus";
