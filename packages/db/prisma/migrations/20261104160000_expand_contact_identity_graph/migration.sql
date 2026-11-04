-- Fase 6 (S14 · ADR-193): Migración aditiva (expand-only) del Grafo de Identidad Canónica.
-- Crea `Organization`, `Contact`, `ContactIdentity` e `IdentityMergeCandidate` y agrega
-- la FK anulable `contactId` (`ON DELETE SET NULL`) en las 8 entidades relacionales
-- (`Customer`, `Order`, `SupportTicket`, `Quote`, `AbandonedCart`, `Consent`,
-- `WarrantyClaim`, `RetractRequest`) sin bloquear ni alterar consultas existentes.
--
-- Incluye índices únicos parciales anti-P2002 (ADR-193 §2), CHECK de par distinto y
-- seguridad explícita desde DDL-time: ENABLE ROW LEVEL SECURITY + REVOKE ALL + aserción inline.

-- CreateEnum
CREATE TYPE "ContactIdentityType" AS ENUM ('SUPABASE_USER', 'EMAIL', 'PHONE', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "IdentityVerificationStatus" AS ENUM ('VERIFIED', 'UNVERIFIED_OBSERVED', 'REVOKED');

-- CreateEnum
CREATE TYPE "MergeCandidateStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "taxIdType" "DocumentType",
    "taxIdNumber" TEXT,
    "city" TEXT,
    "department" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "primaryEmail" TEXT,
    "primaryPhoneE164" TEXT,
    "displayName" TEXT,
    "documentType" "DocumentType",
    "documentNumber" TEXT,
    "organizationId" TEXT,
    "ownerAdminId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'GUEST_ORDER',
    "anonymizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactIdentity" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "type" "ContactIdentityType" NOT NULL,
    "normalizedValue" TEXT NOT NULL,
    "verificationStatus" "IdentityVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED_OBSERVED',
    "verifiedAt" TIMESTAMP(3),
    "verificationSource" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdentityMergeCandidate" (
    "id" TEXT NOT NULL,
    "primaryContactId" TEXT NOT NULL,
    "secondaryContactId" TEXT NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "reasonCodes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "status" "MergeCandidateStatus" NOT NULL DEFAULT 'PENDING',
    "evidenceJson" JSONB NOT NULL DEFAULT '{}',
    "reviewedByAdminId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "mergeSnapshotJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdentityMergeCandidate_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "IdentityMergeCandidate_distinct_pair_chk" CHECK ("primaryContactId" <> "secondaryContactId")
);

-- AlterTable (8 FKs anulables expand-only)
ALTER TABLE "Customer" ADD COLUMN "contactId" TEXT;
ALTER TABLE "Order" ADD COLUMN "contactId" TEXT;
ALTER TABLE "RetractRequest" ADD COLUMN "contactId" TEXT;
ALTER TABLE "WarrantyClaim" ADD COLUMN "contactId" TEXT;
ALTER TABLE "AbandonedCart" ADD COLUMN "contactId" TEXT;
ALTER TABLE "Consent" ADD COLUMN "contactId" TEXT;
ALTER TABLE "SupportTicket" ADD COLUMN "contactId" TEXT;
ALTER TABLE "Quote" ADD COLUMN "contactId" TEXT;

-- CreateIndex (Organization)
CREATE INDEX "Organization_deletedAt_idx" ON "Organization"("deletedAt");
CREATE INDEX "Organization_taxIdType_taxIdNumber_idx" ON "Organization"("taxIdType", "taxIdNumber");
CREATE UNIQUE INDEX "Organization_taxId_active_key"
  ON "Organization"("taxIdType", "taxIdNumber")
  WHERE "taxIdType" IS NOT NULL AND "taxIdNumber" IS NOT NULL AND "deletedAt" IS NULL;

-- CreateIndex (Contact — primaryPhoneE164 indexado pero NUNCA único global)
CREATE INDEX "Contact_primaryEmail_idx" ON "Contact"("primaryEmail");
CREATE UNIQUE INDEX "Contact_primaryEmail_active_key"
  ON "Contact"("primaryEmail")
  WHERE "primaryEmail" IS NOT NULL AND "deletedAt" IS NULL;
CREATE INDEX "Contact_primaryPhoneE164_idx" ON "Contact"("primaryPhoneE164");
CREATE INDEX "Contact_documentType_documentNumber_idx" ON "Contact"("documentType", "documentNumber");
CREATE INDEX "Contact_organizationId_idx" ON "Contact"("organizationId");
CREATE INDEX "Contact_ownerAdminId_idx" ON "Contact"("ownerAdminId");
CREATE INDEX "Contact_source_createdAt_idx" ON "Contact"("source", "createdAt");
CREATE INDEX "Contact_deletedAt_idx" ON "Contact"("deletedAt");

-- CreateIndex (ContactIdentity — unicidad global parcial SOLO para SUPABASE_USER y EMAIL no revocados)
CREATE UNIQUE INDEX "ContactIdentity_contactId_type_normalizedValue_key" ON "ContactIdentity"("contactId", "type", "normalizedValue");
CREATE INDEX "ContactIdentity_type_normalizedValue_idx" ON "ContactIdentity"("type", "normalizedValue");
CREATE INDEX "ContactIdentity_contactId_verificationStatus_idx" ON "ContactIdentity"("contactId", "verificationStatus");
CREATE UNIQUE INDEX "ContactIdentity_unique_owner_key"
  ON "ContactIdentity"("type", "normalizedValue")
  WHERE "type" IN ('SUPABASE_USER', 'EMAIL') AND "verificationStatus" <> 'REVOKED';

-- CreateIndex (IdentityMergeCandidate)
CREATE UNIQUE INDEX "IdentityMergeCandidate_primaryContactId_secondaryContactId_key" ON "IdentityMergeCandidate"("primaryContactId", "secondaryContactId");
CREATE INDEX "IdentityMergeCandidate_status_createdAt_idx" ON "IdentityMergeCandidate"("status", "createdAt");
CREATE INDEX "IdentityMergeCandidate_secondaryContactId_idx" ON "IdentityMergeCandidate"("secondaryContactId");
CREATE INDEX "IdentityMergeCandidate_reviewedByAdminId_idx" ON "IdentityMergeCandidate"("reviewedByAdminId");

-- CreateIndex (8 entidades existentes)
CREATE UNIQUE INDEX "Customer_contactId_key" ON "Customer"("contactId");
CREATE INDEX "Order_contactId_deletedAt_idx" ON "Order"("contactId", "deletedAt");
CREATE INDEX "RetractRequest_contactId_idx" ON "RetractRequest"("contactId");
CREATE INDEX "WarrantyClaim_contactId_idx" ON "WarrantyClaim"("contactId");
CREATE INDEX "AbandonedCart_contactId_idx" ON "AbandonedCart"("contactId");
CREATE INDEX "Consent_contactId_scope_idx" ON "Consent"("contactId", "scope");
CREATE INDEX "SupportTicket_contactId_idx" ON "SupportTicket"("contactId");
CREATE INDEX "Quote_contactId_deletedAt_idx" ON "Quote"("contactId", "deletedAt");

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_ownerAdminId_fkey" FOREIGN KEY ("ownerAdminId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ContactIdentity" ADD CONSTRAINT "ContactIdentity_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IdentityMergeCandidate" ADD CONSTRAINT "IdentityMergeCandidate_primaryContactId_fkey" FOREIGN KEY ("primaryContactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IdentityMergeCandidate" ADD CONSTRAINT "IdentityMergeCandidate_secondaryContactId_fkey" FOREIGN KEY ("secondaryContactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IdentityMergeCandidate" ADD CONSTRAINT "IdentityMergeCandidate_reviewedByAdminId_fkey" FOREIGN KEY ("reviewedByAdminId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Customer" ADD CONSTRAINT "Customer_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RetractRequest" ADD CONSTRAINT "RetractRequest_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WarrantyClaim" ADD CONSTRAINT "WarrantyClaim_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AbandonedCart" ADD CONSTRAINT "AbandonedCart_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Consent" ADD CONSTRAINT "Consent_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seguridad mandatoria desde DDL-time (cero suposiciones, ADR-193 §4):
ALTER TABLE "Organization" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Contact" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ContactIdentity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "IdentityMergeCandidate" ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  tbl text;
  leaked_grants int;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['Organization', 'Contact', 'ContactIdentity', 'IdentityMergeCandidate']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE ALL ON TABLE %I FROM anon', tbl);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format('REVOKE ALL ON TABLE %I FROM authenticated', tbl);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
      EXECUTE format('REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE %I FROM service_role', tbl);
    END IF;

    IF EXISTS (
      SELECT 1 FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename = tbl
        AND rowsecurity = false
    ) THEN
      RAISE EXCEPTION 'Tabla % quedó sin RLS habilitada', tbl;
    END IF;

    SELECT count(*) INTO leaked_grants
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name = tbl
      AND (
        grantee IN ('anon', 'authenticated')
        OR (grantee = 'service_role'
            AND privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE'))
      );

    IF leaked_grants > 0 THEN
      RAISE EXCEPTION 'Tabla % conserva % grants no autorizados en PostgREST', tbl, leaked_grants;
    END IF;
  END LOOP;
END $$;
