-- S24 (Fase 12): Pipeline consultivo B2B / Eventos (`Opportunity`) y enlace opcional desde `Task`.
-- Seguridad cero suposiciones:
--  1) CREATE TABLE + índices + FKs + CHECK constraints de dominio y centavos COP >= 0.
--  2) ENABLE ROW LEVEL SECURITY explícita.
--  3) REVOKE ALL para `anon` y `authenticated`, y REVOKE DML para `service_role`.
--  4) Verificación inline `DO $$ ... RAISE EXCEPTION $$`.

CREATE TABLE IF NOT EXISTS "public"."Opportunity" (
  "id" TEXT NOT NULL,
  "number" TEXT NOT NULL,
  "contactId" TEXT NOT NULL,
  "organizationId" TEXT,
  "ownerAdminId" TEXT,
  "title" TEXT NOT NULL,
  "eventType" TEXT NOT NULL DEFAULT 'CORPORATE_GIFT',
  "stage" TEXT NOT NULL DEFAULT 'NEW',
  "expectedUnits" INTEGER,
  "expectedAmountCop" INTEGER NOT NULL DEFAULT 0,
  "eventDate" TIMESTAMP(3),
  "city" TEXT,
  "department" TEXT,
  "notes" TEXT,
  "internalNotes" TEXT,
  "lostReason" TEXT,
  "convertedQuoteId" TEXT,
  "convertedOrderId" TEXT,
  "dataConsentAt" TIMESTAMP(3),
  "dataConsentVersion" TEXT,
  "utmSource" TEXT,
  "utmMedium" TEXT,
  "utmCampaign" TEXT,
  "landingPath" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  "deletedBy" TEXT,

  CONSTRAINT "Opportunity_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Opportunity_stage_check" CHECK (
    "stage" IN ('NEW', 'QUALIFYING', 'PROPOSAL_SENT', 'WON', 'LOST')
  ),
  CONSTRAINT "Opportunity_eventType_check" CHECK (
    "eventType" IN ('CORPORATE_GIFT', 'WEDDING_SOCIAL', 'SCHOOL_GRADUATION', 'BRAND_MERCH', 'OTHER')
  ),
  CONSTRAINT "Opportunity_expectedUnits_nonnegative_check" CHECK (
    "expectedUnits" IS NULL OR "expectedUnits" >= 0
  ),
  CONSTRAINT "Opportunity_expectedAmountCop_nonnegative_check" CHECK (
    "expectedAmountCop" >= 0
  )
);

ALTER TABLE "public"."Task"
  ADD COLUMN IF NOT EXISTS "opportunityId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Opportunity_number_key"
  ON "public"."Opportunity"("number");

CREATE INDEX IF NOT EXISTS "Opportunity_stage_deletedAt_createdAt_idx"
  ON "public"."Opportunity"("stage", "deletedAt", "createdAt");

CREATE INDEX IF NOT EXISTS "Opportunity_contactId_deletedAt_idx"
  ON "public"."Opportunity"("contactId", "deletedAt");

CREATE INDEX IF NOT EXISTS "Opportunity_organizationId_deletedAt_idx"
  ON "public"."Opportunity"("organizationId", "deletedAt");

CREATE INDEX IF NOT EXISTS "Opportunity_ownerAdminId_stage_idx"
  ON "public"."Opportunity"("ownerAdminId", "stage");

CREATE INDEX IF NOT EXISTS "Task_opportunityId_status_idx"
  ON "public"."Task"("opportunityId", "status");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Opportunity_contactId_fkey'
  ) THEN
    ALTER TABLE "public"."Opportunity"
      ADD CONSTRAINT "Opportunity_contactId_fkey"
      FOREIGN KEY ("contactId") REFERENCES "public"."Contact"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Opportunity_organizationId_fkey'
  ) THEN
    ALTER TABLE "public"."Opportunity"
      ADD CONSTRAINT "Opportunity_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Opportunity_ownerAdminId_fkey'
  ) THEN
    ALTER TABLE "public"."Opportunity"
      ADD CONSTRAINT "Opportunity_ownerAdminId_fkey"
      FOREIGN KEY ("ownerAdminId") REFERENCES "public"."AdminUser"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Opportunity_convertedQuoteId_fkey'
  ) THEN
    ALTER TABLE "public"."Opportunity"
      ADD CONSTRAINT "Opportunity_convertedQuoteId_fkey"
      FOREIGN KEY ("convertedQuoteId") REFERENCES "public"."Quote"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Opportunity_convertedOrderId_fkey'
  ) THEN
    ALTER TABLE "public"."Opportunity"
      ADD CONSTRAINT "Opportunity_convertedOrderId_fkey"
      FOREIGN KEY ("convertedOrderId") REFERENCES "public"."Order"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Task_opportunityId_fkey'
  ) THEN
    ALTER TABLE "public"."Task"
      ADD CONSTRAINT "Task_opportunityId_fkey"
      FOREIGN KEY ("opportunityId") REFERENCES "public"."Opportunity"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "public"."Opportunity" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."Opportunity" FROM anon, authenticated;
REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."Opportunity" FROM service_role;

DO $$
DECLARE
  unprotected_count int;
  leaked_grants int;
BEGIN
  SELECT count(*) INTO unprotected_count
  FROM pg_tables
  WHERE schemaname = 'public'
    AND tablename = 'Opportunity'
    AND rowsecurity = false;

  IF unprotected_count > 0 THEN
    RAISE EXCEPTION 'Opportunity sin RLS habilitada';
  END IF;

  SELECT count(*) INTO leaked_grants
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND table_name = 'Opportunity'
    AND (
      grantee IN ('anon', 'authenticated')
      OR (grantee = 'service_role'
          AND privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE'))
    );

  IF leaked_grants > 0 THEN
    RAISE EXCEPTION 'Opportunity conserva % grants no autorizados en PostgREST', leaked_grants;
  END IF;
END $$;
