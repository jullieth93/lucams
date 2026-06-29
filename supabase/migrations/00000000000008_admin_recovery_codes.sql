-- Códigos de respaldo de MFA admin (Lucy 2026-06-27).
CREATE TABLE "AdminRecoveryCode" (
  "id" TEXT NOT NULL,
  "adminUserId" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminRecoveryCode_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AdminRecoveryCode_adminUserId_usedAt_idx"
  ON "AdminRecoveryCode" ("adminUserId", "usedAt");
ALTER TABLE "AdminRecoveryCode"
  ADD CONSTRAINT "AdminRecoveryCode_adminUserId_fkey"
  FOREIGN KEY ("adminUserId") REFERENCES "AdminUser" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
-- RLS deny-by-default (solo service_role; el guard R4 exige RLS en toda tabla pública).
ALTER TABLE "AdminRecoveryCode" ENABLE ROW LEVEL SECURITY;
