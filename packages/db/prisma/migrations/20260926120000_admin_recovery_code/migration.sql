-- A5-01 (remediación R6, 2026-09-27): AdminRecoveryCode se creaba SOLO desde
-- supabase/migrations/00000000000008 — doble fuente de verdad y drift permanente
-- (warning conocido en packages/db/scripts/audit-schema-drift.mjs). Esta migración
-- aditiva convierte a Prisma en la fuente única del CREATE TABLE.
--
-- Estrategia: FORWARD-ONLY — la tabla está en uso en todos los ambientes (códigos
-- de respaldo MFA admin), no hay rollback DROP. Todo es IF NOT EXISTS porque en
-- los ambientes existentes la tabla ya la creó la SQL 008, y en setups desde cero
-- el orden de aplicación es prisma → supabase (la 008 quedó igualmente idempotente
-- para no chocar con esta tabla ya creada).
CREATE TABLE IF NOT EXISTS "AdminRecoveryCode" (
  "id" TEXT NOT NULL,
  "adminUserId" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminRecoveryCode_pkey" PRIMARY KEY ("id")
);

-- Índice + FK + RLS solo si el rol migrador es DUEÑO de la tabla: CREATE INDEX /
-- ADD CONSTRAINT / ENABLE RLS fallan con "must be owner" aunque el objeto ya
-- exista. En la nube el dueño es postgres (la 008 corre con ese rol) y Prisma
-- también migra como postgres → aplica acá. En local la tabla existente es de
-- supabase_admin → se salta y la 008 (idempotente, corre como supabase_admin)
-- garantiza índice/FK/RLS; en un setup local desde cero Prisma crea la tabla y
-- ES dueño → aplica acá y la 008 no-op.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'AdminRecoveryCode' AND tableowner = current_user
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public' AND indexname = 'AdminRecoveryCode_adminUserId_usedAt_idx'
    ) THEN
      EXECUTE 'CREATE INDEX "AdminRecoveryCode_adminUserId_usedAt_idx" ON "AdminRecoveryCode" ("adminUserId", "usedAt")';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'AdminRecoveryCode_adminUserId_fkey'
    ) THEN
      ALTER TABLE "AdminRecoveryCode"
        ADD CONSTRAINT "AdminRecoveryCode_adminUserId_fkey"
        FOREIGN KEY ("adminUserId") REFERENCES "AdminUser" ("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    -- RLS deny-by-default (misma postura que la SQL 008 y el event trigger de la 014).
    ALTER TABLE "AdminRecoveryCode" ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;
