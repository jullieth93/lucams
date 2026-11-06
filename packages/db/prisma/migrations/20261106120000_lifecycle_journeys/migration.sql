DO $$
BEGIN
  CREATE TYPE "LifecycleTrigger" AS ENUM ('FIRST_PURCHASE', 'SECOND_PURCHASE', 'REACTIVATION', 'HIGH_INTENT', 'B2B_FOLLOW_UP');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "LifecycleJourneyStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "LifecycleEnrollmentStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'EXITED', 'SUPPRESSED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "LifecycleStepCondition" AS ENUM ('ALWAYS', 'NO_PAID_ORDER', 'HAS_ABANDONED_CART', 'HAS_LOYALTY_POINTS', 'HAS_DESIGN_ACTIVITY', 'HAS_OPT_IN', 'ORDER_DELIVERED', 'NO_ORDER_SINCE_ENROLLMENT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "LifecycleMessageStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SUPPRESSED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "LifecycleJourney" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "trigger" "LifecycleTrigger" NOT NULL,
  "status" "LifecycleJourneyStatus" NOT NULL DEFAULT 'DRAFT',
  "version" INTEGER NOT NULL DEFAULT 1,
  "requireOptIn" BOOLEAN NOT NULL DEFAULT true,
  "inactivityDays" INTEGER NOT NULL DEFAULT 90,
  "entryLookbackDays" INTEGER NOT NULL DEFAULT 30,
  "cooldownDays" INTEGER NOT NULL DEFAULT 180,
  "maxMessagesPerDay" INTEGER NOT NULL DEFAULT 2,
  "quietStartHour" INTEGER NOT NULL DEFAULT 20,
  "quietEndHour" INTEGER NOT NULL DEFAULT 8,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" TEXT,
  "updatedBy" TEXT,
  CONSTRAINT "LifecycleJourney_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "LifecycleJourneyStep" (
  "id" TEXT NOT NULL,
  "journeyId" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "delayMinutes" INTEGER NOT NULL DEFAULT 0,
  "templateKey" TEXT NOT NULL DEFAULT 'lifecycle-message',
  "subject" TEXT NOT NULL,
  "heading" TEXT NOT NULL,
  "preheader" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "ctaLabel" TEXT NOT NULL,
  "ctaPath" TEXT NOT NULL,
  "commercial" BOOLEAN NOT NULL DEFAULT true,
  "condition" "LifecycleStepCondition" NOT NULL DEFAULT 'ALWAYS',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LifecycleJourneyStep_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "LifecycleEnrollment" (
  "id" TEXT NOT NULL,
  "journeyId" TEXT NOT NULL,
  "contactId" TEXT NOT NULL,
  "cycle" INTEGER NOT NULL DEFAULT 1,
  "status" "LifecycleEnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
  "currentStepId" TEXT,
  "nextRunAt" TIMESTAMP(3) NOT NULL,
  "lastRunAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "exitReason" TEXT,
  "triggerRef" TEXT,
  "data" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LifecycleEnrollment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "LifecycleMessage" (
  "id" TEXT NOT NULL,
  "enrollmentId" TEXT NOT NULL,
  "stepId" TEXT NOT NULL,
  "contactId" TEXT NOT NULL,
  "dedupKey" TEXT NOT NULL,
  "publicTokenHash" TEXT,
  "resendId" TEXT,
  "status" "LifecycleMessageStatus" NOT NULL DEFAULT 'PENDING',
  "subject" TEXT NOT NULL,
  "ctaUrl" TEXT NOT NULL,
  "error" TEXT,
  "scheduledFor" TIMESTAMP(3) NOT NULL,
  "sentAt" TIMESTAMP(3),
  "clickedAt" TIMESTAMP(3),
  "convertedAt" TIMESTAMP(3),
  "revenueCents" INTEGER NOT NULL DEFAULT 0,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LifecycleMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "LifecycleJourney_key_key" ON "LifecycleJourney"("key");
CREATE INDEX IF NOT EXISTS "LifecycleJourney_trigger_status_idx" ON "LifecycleJourney"("trigger", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "LifecycleJourneyStep_journeyId_position_key" ON "LifecycleJourneyStep"("journeyId", "position");
CREATE INDEX IF NOT EXISTS "LifecycleJourneyStep_journeyId_position_idx" ON "LifecycleJourneyStep"("journeyId", "position");
CREATE UNIQUE INDEX IF NOT EXISTS "LifecycleEnrollment_journeyId_contactId_cycle_key" ON "LifecycleEnrollment"("journeyId", "contactId", "cycle");
CREATE INDEX IF NOT EXISTS "LifecycleEnrollment_status_nextRunAt_idx" ON "LifecycleEnrollment"("status", "nextRunAt");
CREATE INDEX IF NOT EXISTS "LifecycleEnrollment_contactId_status_idx" ON "LifecycleEnrollment"("contactId", "status");
CREATE INDEX IF NOT EXISTS "LifecycleEnrollment_triggerRef_idx" ON "LifecycleEnrollment"("triggerRef");
CREATE UNIQUE INDEX IF NOT EXISTS "LifecycleMessage_dedupKey_key" ON "LifecycleMessage"("dedupKey");
CREATE UNIQUE INDEX IF NOT EXISTS "LifecycleMessage_publicTokenHash_key" ON "LifecycleMessage"("publicTokenHash");
CREATE INDEX IF NOT EXISTS "LifecycleMessage_contactId_status_idx" ON "LifecycleMessage"("contactId", "status");
CREATE INDEX IF NOT EXISTS "LifecycleMessage_status_scheduledFor_idx" ON "LifecycleMessage"("status", "scheduledFor");
CREATE INDEX IF NOT EXISTS "LifecycleMessage_resendId_idx" ON "LifecycleMessage"("resendId");
CREATE INDEX IF NOT EXISTS "LifecycleMessage_clickedAt_convertedAt_idx" ON "LifecycleMessage"("clickedAt", "convertedAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LifecycleJourneyStep_journeyId_fkey') THEN
    ALTER TABLE "LifecycleJourneyStep" ADD CONSTRAINT "LifecycleJourneyStep_journeyId_fkey"
      FOREIGN KEY ("journeyId") REFERENCES "LifecycleJourney"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LifecycleEnrollment_journeyId_fkey') THEN
    ALTER TABLE "LifecycleEnrollment" ADD CONSTRAINT "LifecycleEnrollment_journeyId_fkey"
      FOREIGN KEY ("journeyId") REFERENCES "LifecycleJourney"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LifecycleEnrollment_contactId_fkey') THEN
    ALTER TABLE "LifecycleEnrollment" ADD CONSTRAINT "LifecycleEnrollment_contactId_fkey"
      FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LifecycleEnrollment_currentStepId_fkey') THEN
    ALTER TABLE "LifecycleEnrollment" ADD CONSTRAINT "LifecycleEnrollment_currentStepId_fkey"
      FOREIGN KEY ("currentStepId") REFERENCES "LifecycleJourneyStep"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LifecycleMessage_enrollmentId_fkey') THEN
    ALTER TABLE "LifecycleMessage" ADD CONSTRAINT "LifecycleMessage_enrollmentId_fkey"
      FOREIGN KEY ("enrollmentId") REFERENCES "LifecycleEnrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LifecycleMessage_stepId_fkey') THEN
    ALTER TABLE "LifecycleMessage" ADD CONSTRAINT "LifecycleMessage_stepId_fkey"
      FOREIGN KEY ("stepId") REFERENCES "LifecycleJourneyStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LifecycleMessage_contactId_fkey') THEN
    ALTER TABLE "LifecycleMessage" ADD CONSTRAINT "LifecycleMessage_contactId_fkey"
      FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LifecycleJourney_version_positive_chk') THEN
    ALTER TABLE "LifecycleJourney" ADD CONSTRAINT "LifecycleJourney_version_positive_chk" CHECK ("version" > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LifecycleJourney_inactivityDays_nonneg_chk') THEN
    ALTER TABLE "LifecycleJourney" ADD CONSTRAINT "LifecycleJourney_inactivityDays_nonneg_chk" CHECK ("inactivityDays" >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LifecycleJourney_entryLookbackDays_positive_chk') THEN
    ALTER TABLE "LifecycleJourney" ADD CONSTRAINT "LifecycleJourney_entryLookbackDays_positive_chk" CHECK ("entryLookbackDays" > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LifecycleJourney_cooldownDays_nonneg_chk') THEN
    ALTER TABLE "LifecycleJourney" ADD CONSTRAINT "LifecycleJourney_cooldownDays_nonneg_chk" CHECK ("cooldownDays" >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LifecycleJourney_maxMessagesPerDay_positive_chk') THEN
    ALTER TABLE "LifecycleJourney" ADD CONSTRAINT "LifecycleJourney_maxMessagesPerDay_positive_chk" CHECK ("maxMessagesPerDay" > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LifecycleJourney_quietHours_chk') THEN
    ALTER TABLE "LifecycleJourney" ADD CONSTRAINT "LifecycleJourney_quietHours_chk" CHECK ("quietStartHour" BETWEEN 0 AND 23 AND "quietEndHour" BETWEEN 0 AND 23);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LifecycleJourneyStep_position_positive_chk') THEN
    ALTER TABLE "LifecycleJourneyStep" ADD CONSTRAINT "LifecycleJourneyStep_position_positive_chk" CHECK ("position" > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LifecycleJourneyStep_delayMinutes_nonneg_chk') THEN
    ALTER TABLE "LifecycleJourneyStep" ADD CONSTRAINT "LifecycleJourneyStep_delayMinutes_nonneg_chk" CHECK ("delayMinutes" >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LifecycleJourneyStep_ctaPath_safe_chk') THEN
    ALTER TABLE "LifecycleJourneyStep" ADD CONSTRAINT "LifecycleJourneyStep_ctaPath_safe_chk" CHECK ("ctaPath" LIKE '/%');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LifecycleEnrollment_cycle_positive_chk') THEN
    ALTER TABLE "LifecycleEnrollment" ADD CONSTRAINT "LifecycleEnrollment_cycle_positive_chk" CHECK ("cycle" > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LifecycleMessage_revenueCents_nonneg_chk') THEN
    ALTER TABLE "LifecycleMessage" ADD CONSTRAINT "LifecycleMessage_revenueCents_nonneg_chk" CHECK ("revenueCents" >= 0);
  END IF;
END $$;
