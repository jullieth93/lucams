-- Códigos de respaldo de MFA admin (Lucy 2026-06-27).
-- Idempotente desde la remediación R6 (2026-09-26, A5-01): la migración Prisma
-- 20260926120000_admin_recovery_code es ahora la fuente única del CREATE TABLE y
-- corre ANTES que este archivo en todo setup (orden prisma → supabase), así que
-- acá todo es IF NOT EXISTS para coexistir con la tabla ya creada.
CREATE TABLE IF NOT EXISTS "AdminRecoveryCode" (
  "id" TEXT NOT NULL,
  "adminUserId" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminRecoveryCode_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AdminRecoveryCode_adminUserId_usedAt_idx"
  ON "AdminRecoveryCode" ("adminUserId", "usedAt");
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AdminRecoveryCode_adminUserId_fkey'
  ) THEN
    ALTER TABLE "AdminRecoveryCode"
      ADD CONSTRAINT "AdminRecoveryCode_adminUserId_fkey"
      FOREIGN KEY ("adminUserId") REFERENCES "AdminUser" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
-- RLS deny-by-default (solo service_role; el guard R4 exige RLS en toda tabla pública).
ALTER TABLE "AdminRecoveryCode" ENABLE ROW LEVEL SECURITY;
