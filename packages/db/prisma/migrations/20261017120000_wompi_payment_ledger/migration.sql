-- Ledger Wompi por intento y transacción. Una referencia congela monto/moneda;
-- una referencia puede tener varias transacciones por el reintento nativo de Wompi.
-- Aditiva: los campos legacy de Order se conservan durante el cutover.

CREATE TYPE "WompiAttemptStatus" AS ENUM ('OPEN', 'IN_FLIGHT', 'APPROVED', 'FAILED', 'SUPERSEDED', 'REVIEW');
CREATE TYPE "WompiPaymentTransactionStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED', 'VOIDED', 'ERROR');

CREATE TABLE "WompiPaymentAttempt" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "reference" TEXT NOT NULL,
  "amountInCents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'COP',
  "status" "WompiAttemptStatus" NOT NULL DEFAULT 'OPEN',
  "backfilled" BOOLEAN NOT NULL DEFAULT false,
  "presentedAt" TIMESTAMP(3),
  "lastSyncedAt" TIMESTAMP(3),
  "supersededAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WompiPaymentAttempt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WompiPaymentAttempt_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WompiPaymentAttempt_reference_key" UNIQUE ("reference"),
  CONSTRAINT "WompiPaymentAttempt_orderId_sequence_key" UNIQUE ("orderId", "sequence"),
  CONSTRAINT "WompiPaymentAttempt_sequence_positive_check" CHECK ("sequence" > 0) NOT VALID,
  CONSTRAINT "WompiPaymentAttempt_amount_positive_check" CHECK ("amountInCents" > 0) NOT VALID
);

CREATE TABLE "WompiPaymentTransaction" (
  "id" TEXT NOT NULL,
  "attemptId" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "amountInCents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'COP',
  "status" "WompiPaymentTransactionStatus",
  "paymentMethodType" TEXT,
  "statusMessage" TEXT,
  "providerCreatedAt" TIMESTAMP(3),
  "providerFinalizedAt" TIMESTAMP(3),
  "firstApprovedAt" TIMESTAMP(3),
  "lastEventAt" TIMESTAMP(3),
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WompiPaymentTransaction_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WompiPaymentTransaction_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "WompiPaymentAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WompiPaymentTransaction_externalId_key" UNIQUE ("externalId"),
  CONSTRAINT "WompiPaymentTransaction_amount_positive_check" CHECK ("amountInCents" > 0) NOT VALID
);

CREATE INDEX "WompiPaymentAttempt_orderId_createdAt_idx" ON "WompiPaymentAttempt"("orderId", "createdAt");
CREATE INDEX "WompiPaymentAttempt_status_lastSyncedAt_idx" ON "WompiPaymentAttempt"("status", "lastSyncedAt");
CREATE INDEX "WompiPaymentTransaction_attemptId_status_idx" ON "WompiPaymentTransaction"("attemptId", "status");

ALTER TABLE "WompiPaymentAttempt" VALIDATE CONSTRAINT "WompiPaymentAttempt_sequence_positive_check";
ALTER TABLE "WompiPaymentAttempt" VALIDATE CONSTRAINT "WompiPaymentAttempt_amount_positive_check";
ALTER TABLE "WompiPaymentTransaction" VALIDATE CONSTRAINT "WompiPaymentTransaction_amount_positive_check";
