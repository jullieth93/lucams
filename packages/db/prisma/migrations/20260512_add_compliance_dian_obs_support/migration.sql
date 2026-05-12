-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('CC', 'CE', 'NIT', 'PP', 'TI');

-- CreateEnum
CREATE TYPE "TaxResponsibility" AS ENUM ('PERSONA_NATURAL_NO_RESPONSABLE', 'PERSONA_NATURAL_RESPONSABLE', 'PERSONA_JURIDICA');

-- CreateEnum
CREATE TYPE "DianStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'SENT', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ConsentScope" AS ENUM ('COOKIES_NECESSARY', 'COOKIES_FUNCTIONAL', 'COOKIES_ANALYTICS', 'COOKIES_MARKETING', 'NEWSLETTER', 'MARKETING_PROFILING', 'HABEAS_DATA');

-- AlterEnum
ALTER TYPE "WebhookSource" ADD VALUE 'RESEND';

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "documentNumber" TEXT,
ADD COLUMN     "documentType" "DocumentType",
ADD COLUMN     "taxResponsibility" "TaxResponsibility";

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "billingDocumentNumber" TEXT,
ADD COLUMN     "billingDocumentType" "DocumentType",
ADD COLUMN     "billingName" TEXT,
ADD COLUMN     "dianCufe" TEXT,
ADD COLUMN     "dianStatus" "DianStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
ADD COLUMN     "dianXmlUrl" TEXT;

-- AlterTable
ALTER TABLE "Review" ADD COLUMN     "authorCity" TEXT,
ADD COLUMN     "authorName" TEXT,
ADD COLUMN     "featured" BOOLEAN NOT NULL DEFAULT false;

-- DropTable

-- CreateTable
CREATE TABLE "Consent" (
    "id" TEXT NOT NULL,
    "customerId" TEXT,
    "email" TEXT,
    "scope" "ConsentScope" NOT NULL,
    "accepted" BOOLEAN NOT NULL,
    "version" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "revokesId" TEXT,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Consent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebVital" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "rating" TEXT NOT NULL,
    "delta" DOUBLE PRECISION NOT NULL,
    "navType" TEXT,
    "route" TEXT NOT NULL,
    "sessionId" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebVital_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteEvent" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "customerId" TEXT,
    "sessionId" TEXT,
    "route" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiteEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErrorReport" (
    "id" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "stack" TEXT,
    "url" TEXT,
    "userAgent" TEXT,
    "userId" TEXT,
    "digest" TEXT,
    "count" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,

    CONSTRAINT "ErrorReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailEvent" (
    "id" TEXT NOT NULL,
    "resendId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "fromEmail" TEXT NOT NULL,
    "subject" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportTicket" (
    "id" TEXT NOT NULL,
    "customerId" TEXT,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "ip" TEXT,
    "userAgent" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Consent_customerId_scope_idx" ON "Consent"("customerId", "scope");

-- CreateIndex
CREATE INDEX "Consent_email_scope_idx" ON "Consent"("email", "scope");

-- CreateIndex
CREATE INDEX "Consent_scope_acceptedAt_idx" ON "Consent"("scope", "acceptedAt");

-- CreateIndex
CREATE INDEX "WebVital_name_route_createdAt_idx" ON "WebVital"("name", "route", "createdAt");

-- CreateIndex
CREATE INDEX "WebVital_route_createdAt_idx" ON "WebVital"("route", "createdAt");

-- CreateIndex
CREATE INDEX "SiteEvent_name_createdAt_idx" ON "SiteEvent"("name", "createdAt");

-- CreateIndex
CREATE INDEX "SiteEvent_customerId_createdAt_idx" ON "SiteEvent"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "SiteEvent_sessionId_createdAt_idx" ON "SiteEvent"("sessionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ErrorReport_fingerprint_key" ON "ErrorReport"("fingerprint");

-- CreateIndex
CREATE INDEX "ErrorReport_status_lastSeenAt_idx" ON "ErrorReport"("status", "lastSeenAt");

-- CreateIndex
CREATE INDEX "ErrorReport_fingerprint_idx" ON "ErrorReport"("fingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "EmailEvent_resendId_key" ON "EmailEvent"("resendId");

-- CreateIndex
CREATE INDEX "EmailEvent_to_occurredAt_idx" ON "EmailEvent"("to", "occurredAt");

-- CreateIndex
CREATE INDEX "EmailEvent_type_occurredAt_idx" ON "EmailEvent"("type", "occurredAt");

-- CreateIndex
CREATE INDEX "SupportTicket_status_createdAt_idx" ON "SupportTicket"("status", "createdAt");

-- CreateIndex
CREATE INDEX "SupportTicket_customerId_idx" ON "SupportTicket"("customerId");

-- CreateIndex
CREATE INDEX "SupportTicket_email_idx" ON "SupportTicket"("email");

-- CreateIndex
CREATE INDEX "Customer_documentType_documentNumber_idx" ON "Customer"("documentType", "documentNumber");

-- CreateIndex
CREATE INDEX "Order_dianStatus_idx" ON "Order"("dianStatus");

-- CreateIndex
CREATE INDEX "Review_featured_isApproved_idx" ON "Review"("featured", "isApproved");

-- AddForeignKey
ALTER TABLE "Consent" ADD CONSTRAINT "Consent_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consent" ADD CONSTRAINT "Consent_revokesId_fkey" FOREIGN KEY ("revokesId") REFERENCES "Consent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

