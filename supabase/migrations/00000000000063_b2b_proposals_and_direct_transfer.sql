-- Espejo idempotente Supabase (ADR-210): OpportunityProposal, OpportunityProposalItem,
-- Order.b2bProposalId / DIRECT_TRANSFER + RLS deny-by-default y REVOKE explícito.

ALTER TYPE public."PaymentMethod" ADD VALUE IF NOT EXISTS 'DIRECT_TRANSFER';

ALTER TABLE public."Opportunity"
  ADD COLUMN IF NOT EXISTS "requestedConfig" JSONB;

CREATE TABLE IF NOT EXISTS public."OpportunityProposal" (
  "id" TEXT NOT NULL,
  "opportunityId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "number" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "tokenHash" TEXT,
  "validUntil" TIMESTAMP(3) NOT NULL,
  "proofMode" TEXT NOT NULL DEFAULT 'AFTER_PAYMENT',
  "proofAssetPath" TEXT,
  "proofApprovedAt" TIMESTAMP(3),
  "proofApprovedByIp" TEXT,
  "artworkMode" TEXT NOT NULL DEFAULT 'SAME_DESIGN',
  "packagingType" TEXT NOT NULL DEFAULT 'BULK_STANDARD',
  "clientNotes" TEXT,
  "termsNotes" TEXT,
  "estimatedProductionDays" INTEGER NOT NULL DEFAULT 3,
  "shippingMode" TEXT NOT NULL DEFAULT 'QUOTED',
  "shippingCarrier" TEXT,
  "shippingService" TEXT,
  "packageCount" INTEGER NOT NULL DEFAULT 1,
  "departmentCode" TEXT,
  "departmentName" TEXT,
  "cityCode" TEXT,
  "cityName" TEXT,
  "subtotalCents" INTEGER NOT NULL DEFAULT 0,
  "discountCents" INTEGER NOT NULL DEFAULT 0,
  "shippingCents" INTEGER NOT NULL DEFAULT 0,
  "totalCents" INTEGER NOT NULL DEFAULT 0,
  "allowDirectTransfer" BOOLEAN NOT NULL DEFAULT false,
  "createdByAdminId" TEXT,
  "sentAt" TIMESTAMP(3),
  "approvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "OpportunityProposal_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OpportunityProposal_version_positive_check" CHECK ("version" >= 1),
  CONSTRAINT "OpportunityProposal_status_check" CHECK (
    "status" IN ('DRAFT', 'SENT', 'APPROVED', 'CONVERTED', 'EXPIRED', 'SUPERSEDED', 'CANCELLED')
  ),
  CONSTRAINT "OpportunityProposal_proofMode_check" CHECK (
    "proofMode" IN ('BEFORE_PAYMENT', 'AFTER_PAYMENT')
  ),
  CONSTRAINT "OpportunityProposal_shippingMode_check" CHECK (
    "shippingMode" IN ('QUOTED', 'PACTED_MANUAL')
  ),
  CONSTRAINT "OpportunityProposal_estimatedProductionDays_check" CHECK (
    "estimatedProductionDays" >= 1
  ),
  CONSTRAINT "OpportunityProposal_packageCount_check" CHECK ("packageCount" >= 1),
  CONSTRAINT "OpportunityProposal_subtotalCents_nonnegative_check" CHECK ("subtotalCents" >= 0),
  CONSTRAINT "OpportunityProposal_discountCents_nonnegative_check" CHECK ("discountCents" >= 0),
  CONSTRAINT "OpportunityProposal_shippingCents_nonnegative_check" CHECK ("shippingCents" >= 0),
  CONSTRAINT "OpportunityProposal_totalCents_nonnegative_check" CHECK ("totalCents" >= 0)
);

CREATE TABLE IF NOT EXISTS public."OpportunityProposalItem" (
  "id" TEXT NOT NULL,
  "proposalId" TEXT NOT NULL,
  "variantId" TEXT NOT NULL,
  "titleSnapshot" TEXT NOT NULL,
  "skuSnapshot" TEXT NOT NULL,
  "qty" INTEGER NOT NULL,
  "designUnits" INTEGER NOT NULL DEFAULT 1,
  "unitPriceCents" INTEGER NOT NULL,
  "unitCostSnapshotCents" INTEGER,
  "packagingNote" TEXT,
  "designId" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "OpportunityProposalItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OpportunityProposalItem_qty_positive_check" CHECK ("qty" >= 1),
  CONSTRAINT "OpportunityProposalItem_designUnits_positive_check" CHECK ("designUnits" >= 1),
  CONSTRAINT "OpportunityProposalItem_unitPriceCents_nonnegative_check" CHECK ("unitPriceCents" >= 0),
  CONSTRAINT "OpportunityProposalItem_unitCostSnapshotCents_nonnegative_check" CHECK (
    "unitCostSnapshotCents" IS NULL OR "unitCostSnapshotCents" >= 0
  ),
  CONSTRAINT "OpportunityProposalItem_sortOrder_nonnegative_check" CHECK ("sortOrder" >= 0)
);

ALTER TABLE public."Order"
  ADD COLUMN IF NOT EXISTS "b2bProposalId" TEXT,
  ADD COLUMN IF NOT EXISTS "paymentExpiresAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "b2bArtworkReady" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "directPaymentMethod" TEXT,
  ADD COLUMN IF NOT EXISTS "directPaymentReference" TEXT,
  ADD COLUMN IF NOT EXISTS "directPaymentReceiptPath" TEXT,
  ADD COLUMN IF NOT EXISTS "directPaymentReportedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "withholdingCents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "directPaymentConfirmedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "directPaymentConfirmedBy" TEXT,
  ADD COLUMN IF NOT EXISTS "directPaymentNotes" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "OpportunityProposal_number_key"
  ON public."OpportunityProposal"("number");

CREATE UNIQUE INDEX IF NOT EXISTS "OpportunityProposal_tokenHash_key"
  ON public."OpportunityProposal"("tokenHash");

CREATE UNIQUE INDEX IF NOT EXISTS "OpportunityProposal_opportunityId_version_key"
  ON public."OpportunityProposal"("opportunityId", "version");

CREATE INDEX IF NOT EXISTS "OpportunityProposal_opportunityId_status_idx"
  ON public."OpportunityProposal"("opportunityId", "status");

CREATE INDEX IF NOT EXISTS "OpportunityProposal_status_validUntil_idx"
  ON public."OpportunityProposal"("status", "validUntil");

CREATE INDEX IF NOT EXISTS "OpportunityProposalItem_proposalId_sortOrder_idx"
  ON public."OpportunityProposalItem"("proposalId", "sortOrder");

CREATE INDEX IF NOT EXISTS "OpportunityProposalItem_variantId_idx"
  ON public."OpportunityProposalItem"("variantId");

CREATE INDEX IF NOT EXISTS "OpportunityProposalItem_designId_idx"
  ON public."OpportunityProposalItem"("designId");

CREATE UNIQUE INDEX IF NOT EXISTS "Order_b2bProposalId_key"
  ON public."Order"("b2bProposalId");

CREATE INDEX IF NOT EXISTS "Order_paymentMethod_status_directPaymentReportedAt_idx"
  ON public."Order"("paymentMethod", "status", "directPaymentReportedAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'OpportunityProposal_opportunityId_fkey'
      AND conrelid = 'public."OpportunityProposal"'::regclass
  ) THEN
    ALTER TABLE public."OpportunityProposal"
      ADD CONSTRAINT "OpportunityProposal_opportunityId_fkey"
      FOREIGN KEY ("opportunityId") REFERENCES public."Opportunity"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'OpportunityProposal_createdByAdminId_fkey'
      AND conrelid = 'public."OpportunityProposal"'::regclass
  ) THEN
    ALTER TABLE public."OpportunityProposal"
      ADD CONSTRAINT "OpportunityProposal_createdByAdminId_fkey"
      FOREIGN KEY ("createdByAdminId") REFERENCES public."AdminUser"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'OpportunityProposalItem_proposalId_fkey'
      AND conrelid = 'public."OpportunityProposalItem"'::regclass
  ) THEN
    ALTER TABLE public."OpportunityProposalItem"
      ADD CONSTRAINT "OpportunityProposalItem_proposalId_fkey"
      FOREIGN KEY ("proposalId") REFERENCES public."OpportunityProposal"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'OpportunityProposalItem_variantId_fkey'
      AND conrelid = 'public."OpportunityProposalItem"'::regclass
  ) THEN
    ALTER TABLE public."OpportunityProposalItem"
      ADD CONSTRAINT "OpportunityProposalItem_variantId_fkey"
      FOREIGN KEY ("variantId") REFERENCES public."ProductVariant"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'OpportunityProposalItem_designId_fkey'
      AND conrelid = 'public."OpportunityProposalItem"'::regclass
  ) THEN
    ALTER TABLE public."OpportunityProposalItem"
      ADD CONSTRAINT "OpportunityProposalItem_designId_fkey"
      FOREIGN KEY ("designId") REFERENCES public."Design"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Order_b2bProposalId_fkey'
      AND conrelid = 'public."Order"'::regclass
  ) THEN
    ALTER TABLE public."Order"
      ADD CONSTRAINT "Order_b2bProposalId_fkey"
      FOREIGN KEY ("b2bProposalId") REFERENCES public."OpportunityProposal"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Order_withholdingCents_nonnegative_check'
      AND conrelid = 'public."Order"'::regclass
  ) THEN
    ALTER TABLE public."Order"
      ADD CONSTRAINT "Order_withholdingCents_nonnegative_check"
      CHECK ("withholdingCents" >= 0) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Order_directPaymentMethod_check'
      AND conrelid = 'public."Order"'::regclass
  ) THEN
    ALTER TABLE public."Order"
      ADD CONSTRAINT "Order_directPaymentMethod_check"
      CHECK (
        "directPaymentMethod" IS NULL OR "directPaymentMethod" IN ('BRE_B', 'BANK_TRANSFER')
      ) NOT VALID;
  END IF;
END
$$;

ALTER TABLE public."Order" VALIDATE CONSTRAINT "Order_withholdingCents_nonnegative_check";
ALTER TABLE public."Order" VALIDATE CONSTRAINT "Order_directPaymentMethod_check";

ALTER TABLE public."OpportunityProposal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."OpportunityProposalItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Opportunity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Order" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public."OpportunityProposal" FROM anon, authenticated;
REVOKE ALL ON TABLE public."OpportunityProposalItem" FROM anon, authenticated;
REVOKE ALL ON TABLE public."Opportunity" FROM anon, authenticated;
REVOKE ALL ON TABLE public."Order" FROM anon, authenticated;

REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE public."OpportunityProposal" FROM service_role;
REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE public."OpportunityProposalItem" FROM service_role;
REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE public."Opportunity" FROM service_role;
REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE public."Order" FROM service_role;

DO $$
DECLARE
  unprotected_count int;
  leaked_grants int;
BEGIN
  SELECT count(*) INTO unprotected_count
  FROM pg_tables
  WHERE schemaname = 'public'
    AND tablename IN ('OpportunityProposal', 'OpportunityProposalItem')
    AND rowsecurity = false;

  IF unprotected_count > 0 THEN
    RAISE EXCEPTION 'Tablas OpportunityProposal sin RLS habilitada (% hallazgos)', unprotected_count;
  END IF;

  SELECT count(*) INTO leaked_grants
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND table_name IN ('OpportunityProposal', 'OpportunityProposalItem')
    AND (
      grantee IN ('anon', 'authenticated')
      OR (grantee = 'service_role'
          AND privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE'))
    );

  IF leaked_grants > 0 THEN
    RAISE EXCEPTION 'Tablas OpportunityProposal conservan % grants no autorizados en PostgREST', leaked_grants;
  END IF;

  RAISE NOTICE 'OK: OpportunityProposal y OpportunityProposalItem con RLS activa y 0 grants en PostgREST.';
END $$;

