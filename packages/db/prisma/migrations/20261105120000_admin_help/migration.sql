CREATE TABLE IF NOT EXISTS "AdminHelpProgress" (
  "id" TEXT NOT NULL,
  "adminUserId" TEXT NOT NULL,
  "guideId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "currentStep" INTEGER NOT NULL DEFAULT 0,
  "completedAt" TIMESTAMP(3),
  "dismissedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminHelpProgress_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AdminHelpFeedback" (
  "id" TEXT NOT NULL,
  "adminUserId" TEXT NOT NULL,
  "guideId" TEXT NOT NULL,
  "isHelpful" BOOLEAN NOT NULL,
  "comment" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminHelpFeedback_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AdminHelpProgress_adminUserId_guideId_key"
  ON "AdminHelpProgress"("adminUserId", "guideId");
CREATE INDEX IF NOT EXISTS "AdminHelpProgress_adminUserId_updatedAt_idx"
  ON "AdminHelpProgress"("adminUserId", "updatedAt");
CREATE UNIQUE INDEX IF NOT EXISTS "AdminHelpFeedback_adminUserId_guideId_key"
  ON "AdminHelpFeedback"("adminUserId", "guideId");
CREATE INDEX IF NOT EXISTS "AdminHelpFeedback_guideId_isHelpful_idx"
  ON "AdminHelpFeedback"("guideId", "isHelpful");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AdminHelpProgress_adminUserId_fkey') THEN
    ALTER TABLE "AdminHelpProgress"
      ADD CONSTRAINT "AdminHelpProgress_adminUserId_fkey"
      FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AdminHelpFeedback_adminUserId_fkey') THEN
    ALTER TABLE "AdminHelpFeedback"
      ADD CONSTRAINT "AdminHelpFeedback_adminUserId_fkey"
      FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AdminHelpProgress_currentStep_nonneg_chk') THEN
    ALTER TABLE "AdminHelpProgress"
      ADD CONSTRAINT "AdminHelpProgress_currentStep_nonneg_chk" CHECK ("currentStep" >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AdminHelpProgress_version_positive_chk') THEN
    ALTER TABLE "AdminHelpProgress"
      ADD CONSTRAINT "AdminHelpProgress_version_positive_chk" CHECK ("version" > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AdminHelpFeedback_comment_length_chk') THEN
    ALTER TABLE "AdminHelpFeedback"
      ADD CONSTRAINT "AdminHelpFeedback_comment_length_chk" CHECK ("comment" IS NULL OR char_length("comment") <= 1000);
  END IF;
END $$;
