-- ADR-210: Configurador B2B interactivo, propuestas formales versionadas (/propuesta/[token])
-- y riel de pago directo verificado (Bre-B / transferencia bancaria con MFA + retenciones B2B).

ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'DIRECT_TRANSFER';

ALTER TABLE "Opportunity"
  ADD COLUMN IF NOT EXISTS "requestedConfig" JSONB;

CREATE TABLE IF NOT EXISTS "OpportunityProposal" (
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

CREATE TABLE IF NOT EXISTS "OpportunityProposalItem" (
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

ALTER TABLE "Order"
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
  ON "OpportunityProposal"("number");

CREATE UNIQUE INDEX IF NOT EXISTS "OpportunityProposal_tokenHash_key"
  ON "OpportunityProposal"("tokenHash");

CREATE UNIQUE INDEX IF NOT EXISTS "OpportunityProposal_opportunityId_version_key"
  ON "OpportunityProposal"("opportunityId", "version");

CREATE INDEX IF NOT EXISTS "OpportunityProposal_opportunityId_status_idx"
  ON "OpportunityProposal"("opportunityId", "status");

CREATE INDEX IF NOT EXISTS "OpportunityProposal_status_validUntil_idx"
  ON "OpportunityProposal"("status", "validUntil");

CREATE INDEX IF NOT EXISTS "OpportunityProposalItem_proposalId_sortOrder_idx"
  ON "OpportunityProposalItem"("proposalId", "sortOrder");

CREATE INDEX IF NOT EXISTS "OpportunityProposalItem_variantId_idx"
  ON "OpportunityProposalItem"("variantId");

CREATE INDEX IF NOT EXISTS "OpportunityProposalItem_designId_idx"
  ON "OpportunityProposalItem"("designId");

CREATE UNIQUE INDEX IF NOT EXISTS "Order_b2bProposalId_key"
  ON "Order"("b2bProposalId");

CREATE INDEX IF NOT EXISTS "Order_paymentMethod_status_directPaymentReportedAt_idx"
  ON "Order"("paymentMethod", "status", "directPaymentReportedAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'OpportunityProposal_opportunityId_fkey'
  ) THEN
    ALTER TABLE "OpportunityProposal"
      ADD CONSTRAINT "OpportunityProposal_opportunityId_fkey"
      FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'OpportunityProposal_createdByAdminId_fkey'
  ) THEN
    ALTER TABLE "OpportunityProposal"
      ADD CONSTRAINT "OpportunityProposal_createdByAdminId_fkey"
      FOREIGN KEY ("createdByAdminId") REFERENCES "AdminUser"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'OpportunityProposalItem_proposalId_fkey'
  ) THEN
    ALTER TABLE "OpportunityProposalItem"
      ADD CONSTRAINT "OpportunityProposalItem_proposalId_fkey"
      FOREIGN KEY ("proposalId") REFERENCES "OpportunityProposal"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'OpportunityProposalItem_variantId_fkey'
  ) THEN
    ALTER TABLE "OpportunityProposalItem"
      ADD CONSTRAINT "OpportunityProposalItem_variantId_fkey"
      FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'OpportunityProposalItem_designId_fkey'
  ) THEN
    ALTER TABLE "OpportunityProposalItem"
      ADD CONSTRAINT "OpportunityProposalItem_designId_fkey"
      FOREIGN KEY ("designId") REFERENCES "Design"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Order_b2bProposalId_fkey'
  ) THEN
    ALTER TABLE "Order"
      ADD CONSTRAINT "Order_b2bProposalId_fkey"
      FOREIGN KEY ("b2bProposalId") REFERENCES "OpportunityProposal"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Order_withholdingCents_nonnegative_check'
  ) THEN
    ALTER TABLE "Order"
      ADD CONSTRAINT "Order_withholdingCents_nonnegative_check"
      CHECK ("withholdingCents" >= 0) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Order_directPaymentMethod_check'
  ) THEN
    ALTER TABLE "Order"
      ADD CONSTRAINT "Order_directPaymentMethod_check"
      CHECK (
        "directPaymentMethod" IS NULL OR "directPaymentMethod" IN ('BRE_B', 'BANK_TRANSFER')
      ) NOT VALID;
  END IF;
END $$;

ALTER TABLE "Order" VALIDATE CONSTRAINT "Order_withholdingCents_nonnegative_check";
ALTER TABLE "Order" VALIDATE CONSTRAINT "Order_directPaymentMethod_check";

ALTER TABLE "OpportunityProposal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OpportunityProposalItem" ENABLE ROW LEVEL SECURITY;

